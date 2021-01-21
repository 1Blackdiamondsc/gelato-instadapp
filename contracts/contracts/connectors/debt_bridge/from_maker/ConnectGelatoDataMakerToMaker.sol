// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {GelatoBytes} from "../../../../lib/GelatoBytes.sol";
import {wdiv} from "../../../../vendor/DSMath.sol";
import {
    AccountInterface,
    ConnectorInterface
} from "../../../../interfaces/InstaDapp/IInstaDapp.sol";
import {
    IConnectInstaPoolV2
} from "../../../../interfaces/InstaDapp/connectors/IConnectInstaPoolV2.sol";
import {DAI} from "../../../../constants/CTokens.sol";
import {
    CONNECT_MAKER,
    INSTA_POOL_V2,
    CONNECT_BASIC,
    CONNECT_FEE
} from "../../../../constants/CInstaDapp.sol";
import {
    _getMakerVaultDebt,
    _getMakerVaultCollateralBalance,
    _isVaultOwner
} from "../../../../functions/dapps/FMaker.sol";
import {
    _encodeFlashPayback
} from "../../../../functions/InstaDapp/connectors/FInstaPoolV2.sol";
import {
    _encodePaybackMakerVault,
    _encodedWithdrawMakerVault,
    _encodeOpenMakerVault,
    _encodedDepositMakerVault,
    _encodeBorrowMakerVault
} from "../../../../functions/InstaDapp/connectors/FConnectMaker.sol";
import {
    _encodeBasicWithdraw
} from "../../../../functions/InstaDapp/connectors/FConnectBasic.sol";
import {
    _encodeCalculateFee
} from "../../../../functions/InstaDapp/connectors/FConnectDebtBridgeFee.sol";
import {_getGelatoExecutorFees} from "../../../../functions/gelato/FGelato.sol";
import {
    _getFlashLoanRoute,
    _getGasCostMakerToMaker,
    _getRealisedDebt
} from "../../../../functions/gelato/FGelatoDebtBridge.sol";
import {
    DataFlow
} from "@gelatonetwork/core/contracts/gelato_core/interfaces/IGelatoCore.sol";
import {BInstaFeeCollector} from "../../base/BInstaFeeCollector.sol";
import {
    IBInstaFeeCollector
} from "../../../../interfaces/InstaDapp/connectors/base/IBInstaFeeCollector.sol";
import {DAI_ETH_PRICEFEEDER} from "../../../../constants/CChainlink.sol";
import {_getPrice} from "../../../../functions/dapps/FChainlink.sol";

contract ConnectGelatoDataMakerToMaker is
    ConnectorInterface,
    BInstaFeeCollector
{
    using GelatoBytes for bytes;

    string public constant OK = "OK";

    // solhint-disable const-name-snakecase
    string public constant override name = "ConnectGelatoDataMakerToMaker-v3.0";
    uint256 internal immutable _id;
    address public immutable connectGelatoDataMakerToMakerAddr;

    constructor(
        uint256 __id,
        uint256 _fee,
        address payable _feeCollector,
        uint256 _minDebt,
        address __connectGelatoDebtBridgeFee
    )
        BInstaFeeCollector(
            _fee,
            _feeCollector,
            _minDebt,
            __connectGelatoDebtBridgeFee
        )
    {
        _id = __id;
        connectGelatoDataMakerToMakerAddr = address(this);
    }

    /// @dev Connector Details
    function connectorID()
        external
        view
        override
        returns (uint256 _type, uint256 id)
    {
        (_type, id) = (1, _id); // Should put specific value.
    }

    // ====== ACTION TERMS CHECK ==========
    // Overriding IGelatoAction's function (optional)
    function termsOk(
        uint256, // taskReceipId
        address _dsa,
        bytes calldata _actionData,
        DataFlow,
        uint256, // value
        uint256 // cycleId
    ) public view returns (string memory) {
        uint256 vaultAId = abi.decode(_actionData[4:36], (uint256));

        if (vaultAId == 0)
            return "ConnectGelatoDataMakerToMaker: Vault A Id is not valid";
        if (!_isVaultOwner(vaultAId, _dsa))
            return "ConnectGelatoDataMakerToMaker: Vault A not owned by dsa";
        if (_getMakerVaultDebt(vaultAId) < minDebt)
            return "ConnectGelatoDataMakerToMaker: !minDebt";
        return OK;
    }

    /// @notice Entry Point for DSA.cast DebtBridge from e.g ETH-A to ETH-B
    /// @dev payable to be compatible in conjunction with DSA.cast payable target
    /// @param _vaultAId Id of the unsafe vault of the client of Vault A Collateral.
    /// @param _vaultBId Id of the vault B Collateral of the client.
    /// @param _colType colType of the new vault. example : ETH-B, ETH-A.
    function getDataAndCastMakerToMaker(
        uint256 _vaultAId,
        uint256 _vaultBId,
        string calldata _colType
    ) external payable {
        (address[] memory targets, bytes[] memory datas) =
            _dataMakerToMaker(_vaultAId, _vaultBId, _colType);

        _cast(targets, datas);
    }

    function _cast(address[] memory targets, bytes[] memory datas) internal {
        // Instapool V2 / FlashLoan call
        bytes memory castData =
            abi.encodeWithSelector(
                AccountInterface.cast.selector,
                targets,
                datas,
                msg.sender // msg.sender == GelatoCore
            );

        (bool success, bytes memory returndata) =
            address(this).delegatecall(castData);
        if (!success) {
            returndata.revertWithError("ConnectGelatoDataMakerToMaker._cast:");
        }
    }

    /* solhint-disable function-max-lines */

    function _dataMakerToMaker(
        uint256 _vaultAId,
        uint256 _vaultBId,
        string calldata _colType
    ) internal view returns (address[] memory targets, bytes[] memory datas) {
        targets = new address[](1);
        targets[0] = INSTA_POOL_V2;

        _vaultBId = _isVaultOwner(_vaultBId, address(this)) ? _vaultBId : 0;

        uint256 daiToBorrow = _getRealisedDebt(_getMakerVaultDebt(_vaultAId));
        uint256 wColToWithdrawFromMaker =
            _getMakerVaultCollateralBalance(_vaultAId);

        uint256 route = _getFlashLoanRoute(DAI, daiToBorrow);
        uint256 gasFeesPaidFromBor =
            wdiv(
                _getGelatoExecutorFees(
                    _getGasCostMakerToMaker(_vaultBId == 0, route)
                ),
                _getPrice(DAI_ETH_PRICEFEEDER)
            );

        (address[] memory _targets, bytes[] memory _datas) =
            _vaultBId == 0
                ? _spellsMakerToNewMakerVault(
                    _vaultAId,
                    _colType,
                    daiToBorrow,
                    wColToWithdrawFromMaker,
                    gasFeesPaidFromBor
                )
                : _spellsMakerToMaker(
                    _vaultAId,
                    _vaultBId,
                    daiToBorrow,
                    wColToWithdrawFromMaker,
                    gasFeesPaidFromBor
                );

        datas = new bytes[](1);
        datas[0] = abi.encodeWithSelector(
            IConnectInstaPoolV2.flashBorrowAndCast.selector,
            DAI,
            daiToBorrow,
            route,
            abi.encode(_targets, _datas)
        );
    }

    function _spellsMakerToNewMakerVault(
        uint256 _vaultAId,
        string calldata _colType,
        uint256 _daiDebtAmt,
        uint256 _colToWithdrawFromMaker,
        uint256 _gasFeesPaidFromDebt
    ) internal view returns (address[] memory targets, bytes[] memory datas) {
        targets = new address[](9);
        targets[0] = CONNECT_MAKER; // payback
        targets[1] = CONNECT_MAKER; // withdraw
        targets[2] = _connectGelatoDebtBridgeFee; // calculate fee
        targets[3] = CONNECT_MAKER; // open new B vault
        targets[4] = CONNECT_MAKER; // deposit
        targets[5] = CONNECT_MAKER; // borrow
        targets[6] = CONNECT_BASIC; // user pay fee to fee collector
        targets[7] = CONNECT_BASIC; // user pay fast transaction fee to executor
        targets[8] = INSTA_POOL_V2; // flashPayback

        datas = new bytes[](9);
        datas[0] = _encodePaybackMakerVault(
            _vaultAId,
            type(uint256).max,
            0,
            600
        );
        datas[1] = _encodedWithdrawMakerVault(
            _vaultAId,
            type(uint256).max,
            0,
            0
        );
        datas[2] = _encodeCalculateFee(
            0,
            _gasFeesPaidFromDebt,
            IBInstaFeeCollector(connectGelatoDataMakerToMakerAddr).fee(),
            600,
            600,
            601
        );
        datas[3] = _encodeOpenMakerVault(_colType);
        datas[4] = _encodedDepositMakerVault(0, _colToWithdrawFromMaker, 0, 0);
        datas[5] = _encodeBorrowMakerVault(0, 0, 600, 0);
        datas[6] = _encodeBasicWithdraw(
            DAI,
            0,
            IBInstaFeeCollector(connectGelatoDataMakerToMakerAddr)
                .feeCollector(),
            601,
            0
        );
        datas[7] = _encodeBasicWithdraw(
            DAI,
            _gasFeesPaidFromDebt,
            payable(tx.origin),
            0,
            0
        );
        datas[8] = _encodeFlashPayback(DAI, _daiDebtAmt, 0, 0);
    }

    function _spellsMakerToMaker(
        uint256 _vaultAId,
        uint256 _vaultBId,
        uint256 _daiDebtAmt,
        uint256 _colToWithdrawFromMaker,
        uint256 _gasFeesPaidFromDebt
    ) internal view returns (address[] memory targets, bytes[] memory datas) {
        targets = new address[](8);
        targets[0] = CONNECT_MAKER; // payback
        targets[1] = CONNECT_MAKER; // withdraw
        targets[2] = _connectGelatoDebtBridgeFee; // calculate fee
        targets[3] = CONNECT_MAKER; // deposit
        targets[4] = CONNECT_MAKER; // borrow
        targets[5] = CONNECT_BASIC; // pay fee to instadapp fee collector
        targets[6] = CONNECT_BASIC; // pay fast transaction fee to gelato executor
        targets[7] = INSTA_POOL_V2; // flashPayback

        datas = new bytes[](8);
        datas[0] = _encodePaybackMakerVault(
            _vaultAId,
            type(uint256).max,
            0,
            600
        );
        datas[1] = _encodedWithdrawMakerVault(
            _vaultAId,
            type(uint256).max,
            0,
            0
        );
        datas[2] = _encodeCalculateFee(
            0,
            _gasFeesPaidFromDebt,
            IBInstaFeeCollector(connectGelatoDataMakerToMakerAddr).fee(),
            600,
            600,
            601
        );
        datas[3] = _encodedDepositMakerVault(
            _vaultBId,
            _colToWithdrawFromMaker,
            0,
            0
        );
        datas[4] = _encodeBorrowMakerVault(_vaultBId, 0, 600, 0);
        datas[5] = _encodeBasicWithdraw(
            DAI,
            0,
            IBInstaFeeCollector(connectGelatoDataMakerToMakerAddr)
                .feeCollector(),
            601,
            0
        );
        datas[6] = _encodeBasicWithdraw(
            DAI,
            _gasFeesPaidFromDebt,
            payable(tx.origin),
            0,
            0
        );
        datas[7] = _encodeFlashPayback(DAI, _daiDebtAmt, 0, 0);
    }

    /* solhint-enable function-max-lines */
}

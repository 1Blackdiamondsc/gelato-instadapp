// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {GelatoBytes} from "../../../../lib/GelatoBytes.sol";
import {
    AccountInterface,
    ConnectorInterface
} from "../../../../interfaces/InstaDapp/IInstaDapp.sol";
import {
    IConnectInstaPoolV2
} from "../../../../interfaces/InstaDapp/connectors/IConnectInstaPoolV2.sol";
import {
    DAI,
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
} from "../../../../functions/InstaDapp/connectors/FConnectFee.sol";
import {
    _getFlashLoanRoute,
    _getRealisedDebt
} from "../../../../functions/gelato/FGelatoDebtBridge.sol";
import {
    DataFlow
} from "@gelatonetwork/core/contracts/gelato_core/interfaces/IGelatoCore.sol";
import {BInstaFeeCollector} from "../../base/BInstaFeeCollector.sol";
import {
    IBInstaFeeCollector
} from "../../../../interfaces/InstaDapp/connectors/base/IBInstaFeeCollector.sol";

contract ConnectGelatoDataFullMakerToMaker is
    ConnectorInterface,
    BInstaFeeCollector
{
    using GelatoBytes for bytes;

    string public constant OK = "OK";

    // solhint-disable const-name-snakecase
    string public constant override name =
        "ConnectGelatoDataFullMakerToMaker-v3.0";
    uint256 internal immutable _id;
    address public immutable connectGelatoDataFullMakerToMakerAddr;

    constructor(
        uint256 id,
        uint256 _fee,
        address payable _feeCollector,
        uint256 _minCol
    ) BInstaFeeCollector(_fee, _feeCollector, _minCol) {
        _id = id;
        connectGelatoDataFullMakerToMakerAddr = address(this);
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
        (uint256 vaultAId, , ) =
            abi.decode(_actionData[4:], (uint256, uint256, string));

        if (vaultAId == 0)
            return "ConnectGelatoDataFullMakerToMaker: Vault A Id is not valid";
        if (!_isVaultOwner(vaultAId, _dsa))
            return
                "ConnectGelatoDataFullMakerToMaker: Vault A not owned by dsa";
        if (_getMakerVaultCollateralBalance(vaultAId) < minCol)
            return "ConnectGelatoDataFullMakerToMaker: col < minCol";
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
            returndata.revertWithError(
                "ConnectGelatoDataFullMakerToMaker._cast:"
            );
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

        uint256 wDaiToBorrow = _getRealisedDebt(_getMakerVaultDebt(_vaultAId));
        uint256 wColToWithdrawFromMaker =
            _getMakerVaultCollateralBalance(_vaultAId);
        uint256 route = _getFlashLoanRoute(DAI, wDaiToBorrow);

        (address[] memory _targets, bytes[] memory _datas) =
            _vaultBId == 0
                ? _spellsMakerToNewMakerVault(
                    _vaultAId,
                    _colType,
                    wDaiToBorrow,
                    wColToWithdrawFromMaker
                )
                : _spellsMakerToMaker(
                    _vaultAId,
                    _vaultBId,
                    wDaiToBorrow,
                    wColToWithdrawFromMaker
                );

        datas = new bytes[](1);
        datas[0] = abi.encodeWithSelector(
            IConnectInstaPoolV2.flashBorrowAndCast.selector,
            DAI,
            wDaiToBorrow,
            route,
            abi.encode(_targets, _datas)
        );
    }

    function _spellsMakerToNewMakerVault(
        uint256 _vaultAId,
        string calldata _colType,
        uint256 _wDaiToBorrow,
        uint256 _wColToWithdrawFromMaker
    ) internal view returns (address[] memory targets, bytes[] memory datas) {
        targets = new address[](8);
        targets[0] = CONNECT_MAKER; // payback
        targets[1] = CONNECT_MAKER; // withdraw
        targets[2] = CONNECT_FEE; // calculate fee
        targets[3] = CONNECT_MAKER; // open new B vault
        targets[4] = CONNECT_MAKER; // deposit
        targets[5] = CONNECT_MAKER; // borrow
        targets[6] = CONNECT_BASIC; // user pay fee to fee collector
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
            IBInstaFeeCollector(connectGelatoDataFullMakerToMakerAddr).fee(),
            600,
            600,
            601
        );
        datas[3] = _encodeOpenMakerVault(_colType);
        datas[4] = _encodedDepositMakerVault(0, _wColToWithdrawFromMaker, 0, 0);
        datas[5] = _encodeBorrowMakerVault(0, 0, 600, 0);
        datas[6] = _encodeBasicWithdraw(
            DAI,
            0,
            IBInstaFeeCollector(connectGelatoDataFullMakerToMakerAddr)
                .feeCollector(),
            601,
            0
        );
        datas[7] = _encodeFlashPayback(DAI, _wDaiToBorrow, 0, 0);
    }

    function _spellsMakerToMaker(
        uint256 _vaultAId,
        uint256 _vaultBId,
        uint256 _wDaiToBorrow,
        uint256 _wColToWithdrawFromMaker
    ) internal view returns (address[] memory targets, bytes[] memory datas) {
        targets = new address[](7);
        targets[0] = CONNECT_MAKER; // payback
        targets[1] = CONNECT_MAKER; // withdraw
        targets[2] = CONNECT_FEE; // calculate fee
        targets[3] = CONNECT_MAKER; // deposit
        targets[4] = CONNECT_MAKER; // borrow
        targets[5] = CONNECT_BASIC; // user pay fee to fee collector
        targets[6] = INSTA_POOL_V2; // flashPayback

        datas = new bytes[](7);
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
            IBInstaFeeCollector(connectGelatoDataFullMakerToMakerAddr).fee(),
            600,
            600,
            601
        );
        datas[3] = _encodedDepositMakerVault(
            _vaultBId,
            _wColToWithdrawFromMaker,
            0,
            0
        );
        datas[4] = _encodeBorrowMakerVault(_vaultBId, 0, 600, 0);
        datas[5] = _encodeBasicWithdraw(
            DAI,
            0,
            IBInstaFeeCollector(connectGelatoDataFullMakerToMakerAddr)
                .feeCollector(),
            601,
            0
        );
        datas[6] = _encodeFlashPayback(DAI, _wDaiToBorrow, 0, 0);
    }

    /* solhint-enable function-max-lines */
}

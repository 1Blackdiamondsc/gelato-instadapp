// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {GelatoBytes} from "../../lib/GelatoBytes.sol";
import {wdiv} from "../../vendor/DSMath.sol";
import {
    AccountInterface,
    ConnectorInterface
} from "../../interfaces/InstaDapp/IInstaDapp.sol";
import {
    IConnectInstaPoolV2
} from "../../interfaces/InstaDapp/connectors/IConnectInstaPoolV2.sol";
import {
    IBInstaFeeCollector
} from "../../interfaces/InstaDapp/connectors/base/IBInstaFeeCollector.sol";
import {DAI} from "../../constants/CTokens.sol";
import {
    CONNECT_MAKER,
    CONNECT_COMPOUND,
    CONNECT_BASIC,
    INSTA_POOL_V2
} from "../../constants/CInstaDapp.sol";
import {
    _getMakerVaultDebt,
    _getMakerVaultCollateralBalance,
    _isVaultOwner
} from "../../functions/dapps/FMaker.sol";
import {
    _encodeFlashPayback
} from "../../functions/InstaDapp/connectors/FInstaPoolV2.sol";
import {
    _encodePaybackMakerVault,
    _encodedWithdrawMakerVault
} from "../../functions/InstaDapp/connectors/FConnectMaker.sol";
import {
    _encodeDepositCompound,
    _encodeBorrowCompound
} from "../../functions/InstaDapp/connectors/FConnectCompound.sol";
import {
    _encodeCalculateFee
} from "../../functions/InstaDapp/connectors/FConnectDebtBridgeFee.sol";
import {_getGelatoExecutorFees} from "../../functions/gelato/FGelato.sol";
import {
    _getFlashLoanRoute,
    _getGasCostMakerToCompound,
    _getRealisedDebt
} from "../../functions/gelato/FGelatoDebtBridge.sol";
import {
    DataFlow
} from "@gelatonetwork/core/contracts/gelato_core/interfaces/IGelatoCore.sol";
import {
    BInstaFeeCollector
} from "../../contracts/connectors/base/BInstaFeeCollector.sol";
import {
    _encodeBasicWithdraw
} from "../../functions/InstaDapp/connectors/FConnectBasic.sol";
import {DAI_ETH_PRICEFEEDER} from "../../constants/CChainlink.sol";
import {_getPrice} from "../../functions/dapps/FChainlink.sol";

contract MockConnectGelatoDataMakerToCompound is
    ConnectorInterface,
    BInstaFeeCollector
{
    using GelatoBytes for bytes;

    string public constant OK = "OK";

    // solhint-disable-next-line const-name-snakecase
    string public constant override name =
        "ConnectGelatoDataMakerToCompound-v1.0";
    uint256 internal immutable _id;
    address public immutable connectGelatoDataMakerToCompoundAddr;

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
        connectGelatoDataMakerToCompoundAddr = address(this);
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
    /// @notice GelatoCore protocol standard function
    /// @dev GelatoCore calls this to verify that a Task is executable
    function termsOk(
        uint256, // taskReceipId
        address _dsa,
        bytes calldata _actionData,
        DataFlow, // DataFlow
        uint256, // value
        uint256 // cycleId
    ) public view returns (string memory) {
        (, uint256 vaultId, ) =
            abi.decode(_actionData[4:], (uint256, uint256, address));

        if (vaultId == 0)
            return "ConnectGelatoDataMakerToCompound: Vault Id is not valid";
        if (!_isVaultOwner(vaultId, _dsa))
            return "ConnectGelatoDataMakerToCompound: Vault not owned by dsa";
        if (_getMakerVaultCollateralBalance(vaultId) < minDebt)
            return "ConnectGelatoDataMakerToCompound: !minDebt";
        return OK;
    }

    /// @notice Entry Point for DSA.cast DebtBridge from Maker to Compound
    /// @dev payable to be compatible in conjunction with DSA.cast payable target
    /// @param _vaultId Id of the unsafe vault of the client.
    /// @param _colToken  vault's col token address .
    function getDataAndCastMakerToCompound(
        uint256 _mockRoute,
        uint256 _vaultId,
        address _colToken
    ) external payable {
        (address[] memory targets, bytes[] memory datas) =
            _dataMakerToCompound(_mockRoute, _vaultId, _colToken);

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
                "ConnectGelatoDataMakerToCompound._cast:"
            );
        }
    }

    /* solhint-disable function-max-lines */

    function _dataMakerToCompound(
        uint256 _mockRoute,
        uint256 _vaultId,
        address _colToken
    ) internal view returns (address[] memory targets, bytes[] memory datas) {
        targets = new address[](1);
        targets[0] = INSTA_POOL_V2;

        uint256 daiToBorrow = _getRealisedDebt(_getMakerVaultDebt(_vaultId));

        uint256 route = _getFlashLoanRoute(DAI, daiToBorrow);
        route = _mockRoute;

        (address[] memory _targets, bytes[] memory _datas) =
            _spellsMakerToCompound(
                _vaultId,
                _colToken,
                daiToBorrow,
                _getMakerVaultCollateralBalance(_vaultId),
                wdiv(
                    _getGelatoExecutorFees(_getGasCostMakerToCompound(route)),
                    _getPrice(DAI_ETH_PRICEFEEDER)
                )
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

    function _spellsMakerToCompound(
        uint256 _vaultId,
        address _colToken,
        uint256 _daiDebtAmt,
        uint256 _colToWithdrawFromMaker,
        uint256 _gasFeesPaidFromDebt
    ) internal view returns (address[] memory targets, bytes[] memory datas) {
        targets = new address[](8);
        targets[0] = CONNECT_MAKER; // payback
        targets[1] = CONNECT_MAKER; // withdraw
        targets[2] = _connectGelatoDebtBridgeFee; // calculate fee
        targets[3] = CONNECT_COMPOUND; // deposit
        targets[4] = CONNECT_COMPOUND; // borrow
        targets[5] = CONNECT_BASIC; // pay fee to instadapp fee collector
        targets[6] = CONNECT_BASIC; // pay fast transaction fee to gelato executor
        targets[7] = INSTA_POOL_V2; // flashPayback

        datas = new bytes[](8);
        datas[0] = _encodePaybackMakerVault(
            _vaultId,
            type(uint256).max,
            0,
            600
        );
        datas[1] = _encodedWithdrawMakerVault(
            _vaultId,
            type(uint256).max,
            0,
            0
        );
        datas[2] = _encodeCalculateFee(
            0,
            _gasFeesPaidFromDebt,
            IBInstaFeeCollector(connectGelatoDataMakerToCompoundAddr).fee(),
            600,
            600,
            601
        );
        datas[3] = _encodeDepositCompound(
            _colToken,
            _colToWithdrawFromMaker,
            0,
            0
        );
        datas[4] = _encodeBorrowCompound(DAI, 0, 600, 0);
        datas[5] = _encodeBasicWithdraw(
            DAI,
            0,
            IBInstaFeeCollector(connectGelatoDataMakerToCompoundAddr)
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

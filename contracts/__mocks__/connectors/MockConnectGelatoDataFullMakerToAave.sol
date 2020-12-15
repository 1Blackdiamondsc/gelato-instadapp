// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import {GelatoBytes} from "../../lib/GelatoBytes.sol";
import {sub} from "../../vendor/DSMath.sol";
import {
    AccountInterface,
    ConnectorInterface
} from "../../interfaces/InstaDapp/IInstaDapp.sol";
import {
    IConnectInstaPoolV2
} from "../../interfaces/InstaDapp/connectors/IConnectInstaPoolV2.sol";
import {
    DAI,
    CONNECT_MAKER,
    CONNECT_AAVE_V2,
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
    _encodeDepositAave,
    _encodeBorrowAave
} from "../../functions/InstaDapp/connectors/FConnectAave.sol";
import {
    _encodePayExecutor
} from "../../functions/InstaDapp/connectors/FConnectGelatoExecutorPayment.sol";
import {_getGelatoExecutorFees} from "../../functions/gelato/FGelato.sol";
import {
    _getFlashLoanRoute,
    _getGasCostMakerToAave,
    _getRealisedDebt
} from "../../functions/gelato/FGelatoDebtBridge.sol";
import {
    DataFlow
} from "@gelatonetwork/core/contracts/gelato_core/interfaces/IGelatoCore.sol";

contract MockConnectGelatoDataFullMakerToAave is ConnectorInterface {
    using GelatoBytes for bytes;

    string public constant OK = "OK";

    // solhint-disable const-name-snakecase
    string public constant override name =
        "MockConnectGelatoDataFullMakerToAave-v1.0";
    uint256 internal immutable _id;
    address internal immutable _connectGelatoExecutorPayment;

    constructor(uint256 id, address connectGelatoExecutorPayment) {
        _id = id;
        _connectGelatoExecutorPayment = connectGelatoExecutorPayment;
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
        (, uint256 vaultId, ) =
            abi.decode(_actionData[4:], (uint256, uint256, address));

        if (vaultId == 0)
            return "ConnectGelatoDataFullMakerToAave: Vault Id is not valid";
        if (!_isVaultOwner(vaultId, _dsa))
            return "ConnectGelatoDataFullMakerToAave: Vault not owned by dsa";
        return OK;
    }

    /// @notice Entry Point for DSA.cast DebtBridge from e.g ETH-A to ETH-B
    /// @dev payable to be compatible in conjunction with DSA.cast payable target
    /// @param _vaultId Id of the unsafe vault of the client of Vault A Collateral.
    /// @param _colToken  vault's col token address .
    function getDataAndCastMakerToAave(
        uint256 _mockRoute,
        uint256 _vaultId,
        address _colToken
    ) external payable {
        (address[] memory targets, bytes[] memory datas) =
            _dataMakerToAave(_mockRoute, _vaultId, _colToken);

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
                "ConnectGelatoDataFullMakerToAave._cast:"
            );
        }
    }

    /* solhint-disable function-max-lines */

    function _dataMakerToAave(
        uint256 _mockRoute,
        uint256 _vaultId,
        address _colToken
    ) internal view returns (address[] memory targets, bytes[] memory datas) {
        address[] memory _targets;
        bytes[] memory _datas;
        targets = new address[](1);
        targets[0] = INSTA_POOL_V2;

        uint256 wDaiToBorrow = _getRealisedDebt(_getMakerVaultDebt(_vaultId));
        uint256 wColToWithdrawFromMaker =
            _getMakerVaultCollateralBalance(_vaultId);
        uint256 route = _getFlashLoanRoute(DAI, wDaiToBorrow);
        route = _mockRoute;
        uint256 gasCost = _getGasCostMakerToAave(route);
        uint256 gasFeesPaidFromCol = _getGelatoExecutorFees(gasCost);

        (_targets, _datas) = _spellMakerToAave(
            _vaultId,
            _colToken,
            wDaiToBorrow,
            wColToWithdrawFromMaker,
            gasFeesPaidFromCol
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

    function _spellMakerToAave(
        uint256 _vaultId,
        address _colToken,
        uint256 _wDaiToBorrow,
        uint256 _wColToWithdrawFromMaker,
        uint256 _gasFeesPaidFromCol
    ) internal view returns (address[] memory targets, bytes[] memory datas) {
        targets = new address[](6);
        targets[0] = CONNECT_MAKER; // payback
        targets[1] = CONNECT_MAKER; // withdraw
        targets[2] = CONNECT_AAVE_V2; // deposit
        targets[3] = CONNECT_AAVE_V2; // borrow
        targets[4] = _connectGelatoExecutorPayment; // payExecutor
        targets[5] = INSTA_POOL_V2; // flashPayback

        datas = new bytes[](6);
        datas[0] = _encodePaybackMakerVault(_vaultId, uint256(-1), 0, 600);
        datas[1] = _encodedWithdrawMakerVault(_vaultId, uint256(-1), 0, 0);
        datas[2] = _encodeDepositAave(
            _colToken,
            sub(_wColToWithdrawFromMaker, _gasFeesPaidFromCol),
            0,
            0
        );
        datas[3] = _encodeBorrowAave(DAI, 0, 2, 600, 0); // Variable rate by default.
        datas[4] = _encodePayExecutor(_colToken, _gasFeesPaidFromCol, 0, 0);
        datas[5] = _encodeFlashPayback(DAI, _wDaiToBorrow, 0, 0);
    }

    /* solhint-enable function-max-lines */
}

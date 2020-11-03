// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import {GelatoBytes} from "../../lib/GelatoBytes.sol";
import {sub, wmul} from "../../vendor/DSMath.sol";
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
    CONNECT_COMPOUND,
    INSTA_POOL_V2
} from "../../constants/CInstaDapp.sol";
import {
    _getMakerVaultDebt,
    _getMakerVaultCollateralBalance
} from "../../functions/dapps/FMaker.sol";
import {
    _encodeFlashPayback
} from "../../functions/InstaDapp/connectors/FInstaPoolV2.sol";
import {
    _encodePaybackMakerVault,
    _encodedWithdrawMakerVault,
    _encodeOpenMakerVault,
    _encodedDepositMakerVault,
    _encodeBorrowDaiMakerVault
} from "../../functions/InstaDapp/connectors/FConnectMaker.sol";
import {
    _encodePayGelatoProvider
} from "../../functions/InstaDapp/connectors/FConnectGelatoProviderPayment.sol";
import {
    _encodeDepositCompound,
    _encodeBorrowCompound
} from "../../functions/InstaDapp/connectors/FConnectCompound.sol";
import {_getGelatoProviderFees} from "../../functions/gelato/FGelato.sol";
import {
    _wCalcCollateralToWithdraw,
    _wCalcDebtToRepay
} from "../../functions/gelato/FGelatoDebtBridge.sol";

contract ConnectGelatoDataForPartialRefinance is ConnectorInterface {
    struct PartialDebtBridgePayload {
        uint256 vaultId;
        address token;
        uint256 wMinColRatioMaker;
        uint256 wMinColRatioB;
        address priceOracle;
        bytes oraclePayload;
    }

    using GelatoBytes for bytes;

    // solhint-disable-next-line const-name-snakecase
    string public constant override name = "ConnectGelatoData-v1.0";
    uint256 internal immutable _id;
    address internal immutable _connectGelatoProviderPayment;

    uint256 public constant GAS_COST = 1490779 + (14908 * 2); // 1490779 + ~2% (Estimated Value)

    constructor(uint256 id, address connectGelatoProviderPayment) {
        _id = id;
        _connectGelatoProviderPayment = connectGelatoProviderPayment;
    }

    /// @dev Connector Details
    function connectorID()
        public
        view
        override
        returns (uint256 _type, uint256 id)
    {
        (_type, id) = (1, _id); // Should put specific value.
    }

    function getDataAndCastForFromMakerToMaker(
        PartialDebtBridgePayload calldata _payload,
        string calldata _colType
    ) public payable {
        (
            address[] memory targets,
            bytes[] memory datas
        ) = _execPayloadForPartialRefinanceFromMakerToMaker(_payload, _colType);

        _cast(targets, datas);
    }

    function getDataAndCastForFromMakerToCompound(
        PartialDebtBridgePayload calldata _payload
    ) public payable {
        (
            address[] memory targets,
            bytes[] memory datas
        ) = _execPayloadForPartialRefinanceFromMakerToCompound(_payload);

        _cast(targets, datas);
    }

    function _cast(address[] memory targets, bytes[] memory datas) internal {
        // Instapool V2 / FlashLoan call
        bytes memory castData = abi.encodeWithSelector(
            AccountInterface.cast.selector,
            targets,
            datas,
            msg.sender // msg.sender == GelatoCore
        );

        (bool success, bytes memory returndata) = address(this).delegatecall(
            castData
        );
        if (!success)
            returndata.revertWithError(
                "ConnectGelatoDataForPartialRefinance._cast:"
            );
    }

    /* solhint-disable function-max-lines */

    /// @notice Generate Task for a full refinancing between Maker to Compound.
    /// @param _payload contain :
    // @param _vaultId Id of the unsafe vault of the client.
    // @param _token  vault's col token address .
    // @param _wMinColRatioMaker Min col ratio (wad) on Maker debt position
    // @param _wMinColRatioB Min col ratio (wad) on debt position B (e.g. Compound, Maker, ...)
    // @param _priceOracle The price oracle contract to supply the collateral price
    //  e.g. Maker's ETH/USD oracle for ETH collateral pricing.
    // @param _oraclePayload The data for making the staticcall to the oracle's read
    //  method e.g. the function selector of MakerOracle's read function.
    // @param _provider address of the paying provider.
    /// @return targets : flashloan contract address
    /// @return datas : calldata for flashloan
    function _execPayloadForPartialRefinanceFromMakerToCompound(
        PartialDebtBridgePayload calldata _payload
    ) internal view returns (address[] memory targets, bytes[] memory datas) {
        targets = new address[](1);
        targets[0] = INSTA_POOL_V2;

        (
            uint256 wDaiDebtToMove,
            uint256 wColToWithdrawFromMaker,
            uint256 gasFeesPaidFromCol
        ) = computeDebtBridge(
            _payload.vaultId,
            _payload.wMinColRatioMaker,
            _payload.wMinColRatioB,
            _payload.priceOracle,
            _payload.oraclePayload
        );

        address[] memory _targets = new address[](6);
        _targets[0] = CONNECT_MAKER; // payback
        _targets[1] = CONNECT_MAKER; // withdraw
        _targets[2] = CONNECT_COMPOUND; // deposit
        _targets[3] = CONNECT_COMPOUND; // borrow
        _targets[4] = _connectGelatoProviderPayment;
        _targets[5] = INSTA_POOL_V2;

        bytes[] memory _datas = new bytes[](6);
        _datas[0] = _encodePaybackMakerVault(
            _payload.vaultId,
            uint256(-1),
            0,
            0
        );
        _datas[1] = _encodedWithdrawMakerVault(
            _payload.vaultId,
            uint256(-1),
            0,
            0
        );
        _datas[2] = _encodeDepositCompound(
            _payload.token,
            sub(wColToWithdrawFromMaker, gasFeesPaidFromCol),
            0,
            0
        );
        _datas[3] = _encodeBorrowCompound(DAI, wDaiDebtToMove, 0, 0);
        _datas[4] = _encodePayGelatoProvider(
            _payload.token,
            gasFeesPaidFromCol,
            0,
            0
        );
        _datas[5] = _encodeFlashPayback(DAI, wDaiDebtToMove, 0, 0);

        datas = new bytes[](1);
        datas[0] = abi.encodeWithSelector(
            IConnectInstaPoolV2.flashBorrowAndCast.selector,
            DAI,
            wDaiDebtToMove,
            0,
            abi.encode(_targets, _datas)
        );
    }

    /// @notice Generate Task for a full refinancing between Maker e.g. ETH-A and ETH-B.
    /// @param _payload contain :
    // @param _vaultId Id of the unsafe vault of the client.
    // @param _token  vault's col token address .
    // @param _wMinColRatioMaker Min col ratio (wad) on Maker debt position
    // @param _wMinColRatioB Min col ratio (wad) on debt position B (e.g. Compound, Maker, ...)
    // @param _priceOracle The price oracle contract to supply the collateral price
    //  e.g. Maker's ETH/USD oracle for ETH collateral pricing.
    // @param _oraclePayload The data for making the staticcall to the oracle's read
    //  method e.g. the function selector of MakerOracle's read function.
    // @param _provider address of the paying provider.
    /// @param _colType colType of the new vault, exemple : ETH-B, ETH-A.
    /// @return targets : flashloan contract address
    /// @return datas : calldata for flashloan
    function _execPayloadForPartialRefinanceFromMakerToMaker(
        PartialDebtBridgePayload calldata _payload,
        string calldata _colType
    ) internal view returns (address[] memory targets, bytes[] memory datas) {
        targets = new address[](1);
        targets[0] = INSTA_POOL_V2;

        (
            uint256 wDaiDebtToMove,
            uint256 wColToWithdrawFromMaker,
            uint256 gasFeesPaidFromCol
        ) = computeDebtBridge(
            _payload.vaultId,
            _payload.wMinColRatioMaker,
            _payload.wMinColRatioB,
            _payload.priceOracle,
            _payload.oraclePayload
        );

        address[] memory _targets = new address[](7);
        _targets[0] = CONNECT_MAKER; // payback
        _targets[1] = CONNECT_MAKER; // withdraw
        _targets[2] = CONNECT_MAKER; // open ETH-B vault
        _targets[3] = CONNECT_MAKER; // deposit
        _targets[4] = CONNECT_MAKER; // borrow
        _targets[5] = _connectGelatoProviderPayment;
        _targets[6] = INSTA_POOL_V2;

        bytes[] memory _datas = new bytes[](7);
        _datas[0] = _encodePaybackMakerVault(
            _payload.vaultId,
            uint256(-1),
            0,
            0
        );
        _datas[1] = _encodedWithdrawMakerVault(
            _payload.vaultId,
            uint256(-1),
            0,
            0
        );
        _datas[2] = _encodeOpenMakerVault(_colType);
        _datas[3] = _encodedDepositMakerVault(
            0,
            sub(wColToWithdrawFromMaker, gasFeesPaidFromCol),
            0,
            0
        );
        _datas[4] = _encodeBorrowDaiMakerVault(0, wDaiDebtToMove, 0, 0);
        _datas[5] = _encodePayGelatoProvider(
            _payload.token,
            gasFeesPaidFromCol,
            0,
            0
        );
        _datas[6] = _encodeFlashPayback(DAI, wDaiDebtToMove, 0, 0);

        datas = new bytes[](1);
        datas[0] = abi.encodeWithSelector(
            IConnectInstaPoolV2.flashBorrowAndCast.selector,
            DAI,
            wDaiDebtToMove,
            0,
            abi.encode(_targets, _datas)
        );
    }

    /// @notice Computes values needed for DebtBridge Maker->ProtocolB
    /// @dev Use wad for colRatios.
    /// @param _vaultId The id of the makerDAO vault.
    /// @param _wMinColRatioMaker Min col ratio (wad) on Maker debt position
    /// @param _wMinColRatioB Min col ratio (wad) on debt position B (e.g. Compound, Maker, ...)
    /// @param _priceOracle The price oracle contract to supply the collateral price
    ///  e.g. Maker's ETH/USD oracle for ETH collateral pricing.
    /// @param _oraclePayload The data for making the staticcall to the oracle's read
    ///  method e.g. the function selector of MakerOracle's read function.
    /// @return wDaiDebtToMove DAI Debt (wad) to:
    ///   flashBorrow->repay Maker->withdraw from B->flashPayback.
    /// @return wColToWithdrawFromMaker (wad) to: withdraw from Maker and deposit on B.
    /// @return gasFeesPaidFromCol Gelato automation-gas-fees paid from user's collateral
    // solhint-disable function-max-lines
    function computeDebtBridge(
        uint256 _vaultId,
        uint256 _wMinColRatioMaker,
        uint256 _wMinColRatioB,
        address _priceOracle,
        bytes calldata _oraclePayload
    )
        public
        view
        returns (
            uint256 wDaiDebtToMove,
            uint256 wColToWithdrawFromMaker,
            uint256 gasFeesPaidFromCol
        )
    {
        uint256 wColPrice;

        // Stack too deep
        {
            (bool success, bytes memory returndata) = _priceOracle.staticcall(
                _oraclePayload
            );

            if (!success) {
                GelatoBytes.revertWithError(
                    returndata,
                    "ConnectGelatoPartialDebtBridgeFromMaker.computeDebtBridge:oracle:"
                );
            }

            wColPrice = abi.decode(returndata, (uint256));
        }

        // TO DO: add fee mechanism for non-ETH collateral debt bridge
        // uint256 gasFeesPaidFromCol = _mul(GAS_COST, wmul(_getGelatoGasPrice(), latestPrice));
        gasFeesPaidFromCol = _getGelatoProviderFees(GAS_COST);

        uint256 wPricedCol = wmul(
            sub(_getMakerVaultCollateralBalance(_vaultId), gasFeesPaidFromCol),
            wColPrice
        );

        uint256 wDaiDebtOnMaker = _getMakerVaultDebt(_vaultId);

        wColToWithdrawFromMaker = _wCalcCollateralToWithdraw(
            _wMinColRatioMaker,
            _wMinColRatioB,
            wColPrice,
            wPricedCol,
            wDaiDebtOnMaker
        );

        wDaiDebtToMove = _wCalcDebtToRepay(
            _wMinColRatioMaker,
            _wMinColRatioB,
            wPricedCol,
            wDaiDebtOnMaker
        );
    }

    /* solhint-enable function-max-lines */
}
// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {
    IConnectInstaPoolV2
} from "../../interfaces/InstaDapp/connectors/IConnectInstaPoolV2.sol";
import {
    IInstaFeeCollector
} from "../../interfaces/InstaDapp/IInstaFeeCollector.sol";
import {DAI, ETH} from "../../constants/CTokens.sol";
import {
    CONNECT_MAKER,
    CONNECT_COMPOUND,
    CONNECT_BASIC,
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
    _encodedWithdrawMakerVault
} from "../../functions/InstaDapp/connectors/FConnectMaker.sol";
import {
    _encodeDepositCompound,
    _encodeBorrowCompound
} from "../../functions/InstaDapp/connectors/FConnectCompound.sol";
import {
    _encodeCalculateFee
} from "../../functions/InstaDapp/connectors/FConnectDebtBridgeFee.sol";
import {
    _encodeBasicWithdraw
} from "../../functions/InstaDapp/connectors/FConnectBasic.sol";
import {_getGelatoExecutorFees} from "../../functions/gelato/FGelato.sol";
import {
    _getFlashLoanRoute,
    _getGasCostMakerToCompound,
    _getRealisedDebt
} from "../../functions/gelato/FGelatoDebtBridge.sol";
import {
    BDebtBridgeFromMaker
} from "../../contracts/Instadapp/connectors/base/BDebtBridgeFromMaker.sol";
import {IOracleAggregator} from "../../interfaces/gelato/IOracleAggregator.sol";
import {_convertTo18} from "../../vendor/Convert.sol";
import {GELATO_EXECUTOR_MODULE} from "../../constants/CGelato.sol";

contract MockConnectGelatoDataMakerToCompound is BDebtBridgeFromMaker {
    // solhint-disable-next-line const-name-snakecase
    string public constant override name =
        "MockConnectGelatoDataMakerToCompound-v1.0";

    // solhint-disable no-empty-blocks
    constructor(
        uint256 __id,
        address _oracleAggregator,
        address __instaFeeCollector,
        address __connectGelatoDebtBridgeFee
    )
        BDebtBridgeFromMaker(
            __id,
            _oracleAggregator,
            __instaFeeCollector,
            __connectGelatoDebtBridgeFee
        )
    {}

    /// @notice Entry Point for DSA.cast DebtBridge from Maker to Compound
    /// @dev payable to be compatible in conjunction with DSA.cast payable target
    /// @param _vaultId Id of the unsafe vault of the client.
    /// @param _colToken  vault's col token address .
    function getDataAndCastMakerToCompound(
        uint256 _vaultId,
        address _colToken,
        uint256 _mockRoute
    ) external payable {
        (address[] memory targets, bytes[] memory datas) =
            _dataMakerToCompound(_vaultId, _colToken, _mockRoute);

        _cast(targets, datas);
    }

    /* solhint-disable function-max-lines */

    function _dataMakerToCompound(
        uint256 _vaultId,
        address _colToken,
        uint256 _mockRoute
    ) internal view returns (address[] memory targets, bytes[] memory datas) {
        targets = new address[](1);
        targets[0] = INSTA_POOL_V2;

        uint256 daiToBorrow = _getRealisedDebt(_getMakerVaultDebt(_vaultId));

        uint256 route = _getFlashLoanRoute(DAI, _vaultId, daiToBorrow);
        route = _mockRoute;

        (uint256 gasFeesPaidFromDebt, uint256 decimals) =
            IOracleAggregator(oracleAggregator).getExpectedReturnAmount(
                _getGelatoExecutorFees(_getGasCostMakerToCompound(route)),
                ETH,
                DAI
            );

        gasFeesPaidFromDebt = _convertTo18(decimals, gasFeesPaidFromDebt);

        (address[] memory _targets, bytes[] memory _datas) =
            _spellsMakerToCompound(
                _vaultId,
                _colToken,
                daiToBorrow,
                _getMakerVaultCollateralBalance(_vaultId),
                gasFeesPaidFromDebt
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
            IInstaFeeCollector(instaFeeCollector).fee(),
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
            IInstaFeeCollector(instaFeeCollector).feeCollector(),
            601,
            0
        );
        datas[6] = _encodeBasicWithdraw(
            DAI,
            _gasFeesPaidFromDebt,
            payable(GELATO_EXECUTOR_MODULE),
            0,
            0
        );
        datas[7] = _encodeFlashPayback(DAI, _daiDebtAmt, 0, 0);
    }

    /* solhint-enable function-max-lines */
}

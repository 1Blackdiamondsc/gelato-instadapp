// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {
    GelatoConditionsStandard
} from "@gelatonetwork/core/contracts/gelato_conditions/GelatoConditionsStandard.sol";
import {
    _getDebtBridgeRoute
} from "../../../functions/gelato/FGelatoDebtBridge.sol";
import {PROTOCOL} from "../../../constants/CDebtBridge.sol";
import {GelatoBytes} from "../../../lib/GelatoBytes.sol";
import {DebtBridgeInputData} from "../../../structs/SDebtBridge.sol";
import {
    _getMakerVaultDebt,
    _getMakerVaultCollateralBalance
} from "../../../functions/dapps/FMaker.sol";
import {
    _getFlashLoanRoute,
    _getRealisedDebt
} from "../../../functions/gelato/FGelatoDebtBridge.sol";
import {DAI} from "../../../constants/CTokens.sol";
import {
    IBInstaFeeCollector
} from "../../../interfaces/InstaDapp/connectors/base/IBInstaFeeCollector.sol";

contract ConditionCanDoRefinance is GelatoConditionsStandard {
    address public immutable bInstaFeeCollector;
    address public immutable oracleAggregator;

    constructor(address _bInstaFeeCollector, address _oracleAggregator) {
        bInstaFeeCollector = _bInstaFeeCollector;
        oracleAggregator = _oracleAggregator;
    }

    function getConditionData(
        address _dsa,
        uint256 _fromVaultId,
        address _colToken,
        uint256 _makerDestVaultId,
        string calldata _makerDestColType
    ) public pure virtual returns (bytes memory) {
        return
            abi.encodeWithSelector(
                this.canDoRefinance.selector,
                _dsa,
                _fromVaultId,
                _colToken,
                _makerDestVaultId,
                _makerDestColType
            );
    }

    function ok(
        uint256,
        bytes calldata _conditionData,
        uint256
    ) public view virtual override returns (string memory) {
        (
            address _dsa,
            uint256 _fromVaultId,
            address _colToken,
            uint256 _makerDestVaultId,
            string memory _makerDestColType
        ) =
            abi.decode(
                _conditionData[4:],
                (address, uint256, address, uint256, string)
            );

        return
            canDoRefinance(
                _dsa,
                _fromVaultId,
                _colToken,
                _makerDestVaultId,
                _makerDestColType
            );
    }

    function canDoRefinance(
        address _dsa,
        uint256 _fromVaultId,
        address _colToken,
        uint256 _makerDestVaultId,
        string memory _makerDestColType
    ) public view returns (string memory) {
        uint256 debtAmt = _getRealisedDebt(_getMakerVaultDebt(_fromVaultId));
        return
            _getDebtBridgeRoute(
                DebtBridgeInputData({
                    dsa: _dsa,
                    colAmt: _getMakerVaultCollateralBalance(_fromVaultId),
                    colToken: _colToken,
                    debtAmt: debtAmt,
                    oracleAggregator: oracleAggregator,
                    makerDestVaultId: _makerDestVaultId,
                    makerDestColType: _makerDestColType,
                    fees: IBInstaFeeCollector(bInstaFeeCollector).fee(),
                    flashRoute: _getFlashLoanRoute(DAI, debtAmt)
                })
            ) != PROTOCOL.NONE
                ? OK
                : "CannotDoRefinance";
    }
}

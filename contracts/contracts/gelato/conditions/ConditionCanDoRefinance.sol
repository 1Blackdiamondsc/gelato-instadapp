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

contract ConditionCanDoRefinance is GelatoConditionsStandard {
    uint256 public immutable fees;

    constructor(uint256 _fees) {
        fees = _fees;
    }

    function getConditionData(
        address _dsa,
        uint256 _fromVaultId,
        address _colToken,
        address _priceOracle,
        uint256 _makerDestVaultId,
        string calldata _makerDestColType
    ) public pure virtual returns (bytes memory) {
        return
            abi.encodeWithSelector(
                this.canDoRefinance.selector,
                _dsa,
                _fromVaultId,
                _colToken,
                _priceOracle,
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
            address _priceOracle,
            uint256 _makerDestVaultId,
            string memory _makerDestColType
        ) =
            abi.decode(
                _conditionData[4:],
                (address, uint256, address, address, uint256, string)
            );

        return
            canDoRefinance(
                _dsa,
                _fromVaultId,
                _colToken,
                _priceOracle,
                _makerDestVaultId,
                _makerDestColType
            );
    }

    function canDoRefinance(
        address _dsa,
        uint256 _fromVaultId,
        address _colToken,
        address _priceOracle,
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
                    priceOracle: _priceOracle,
                    makerDestVaultId: _makerDestVaultId,
                    makerDestColType: _makerDestColType,
                    fees: fees,
                    flashRoute: _getFlashLoanRoute(DAI, debtAmt)
                })
            ) != PROTOCOL.NONE
                ? OK
                : "CannotDoRefinance";
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {
    GelatoConditionsStandard
} from "@gelatonetwork/core/contracts/gelato_conditions/GelatoConditionsStandard.sol";
import {DAI} from "../../../../constants/CTokens.sol";
import {
    _cTokenHasLiquidity
} from "../../../../functions/gelato/conditions/compound/FCompoundHasLiquidity.sol";
import {
    _getMaxAmtToBorrowMakerToCompound
} from "../../../../functions/gelato/FGelatoDebtBridge.sol";

contract ConditionMakerToCompoundLiquid is GelatoConditionsStandard {
    uint256 public immutable fees;

    constructor(uint256 _fees) {
        fees = _fees;
    }

    function getConditionData(uint256 _fromVaultId)
        public
        pure
        virtual
        returns (bytes memory)
    {
        return
            abi.encodeWithSelector(
                this.cTokenHasLiquidity.selector,
                _fromVaultId
            );
    }

    function ok(
        uint256,
        bytes calldata _conditionData,
        uint256
    ) public view virtual override returns (string memory) {
        uint256 _fromVaultId = abi.decode(_conditionData[4:], (uint256));

        return cTokenHasLiquidity(_fromVaultId);
    }

    function cTokenHasLiquidity(uint256 _fromVaultId)
        public
        view
        returns (string memory)
    {
        return
            _cTokenHasLiquidity(
                DAI,
                _getMaxAmtToBorrowMakerToCompound(_fromVaultId, fees)
            )
                ? OK
                : "CompoundHasNotEnoughLiquidity";
    }
}

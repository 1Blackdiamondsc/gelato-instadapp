// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {
    _cTokenHasLiquidity
} from "../../functions/gelato/conditions/compound/FCompoundHasLiquidity.sol";
import {
    _compoundPositionWillBeSafe
} from "../../functions/gelato/conditions/compound/FCompoundPositionWillBeSafe.sol";

contract CompoundResolver {
    function compoundHasLiquidity(uint256 _amountToBorrow, address _debtToken)
        public
        view
        returns (bool)
    {
        return _cTokenHasLiquidity(_debtToken, _amountToBorrow);
    }

    function compoundPositionWouldBeSafe(
        address _dsa,
        uint256 _colAmt,
        address _debtToken,
        uint256 _debtAmt
    ) public view returns (bool) {
        return _compoundPositionWillBeSafe(_dsa, _colAmt, _debtToken, _debtAmt);
    }
}

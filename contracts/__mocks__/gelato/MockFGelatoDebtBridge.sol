// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {
    _getFlashLoanRoute,
    _getRealisedDebt
} from "../../functions/gelato/FGelatoDebtBridge.sol";

contract FGelatoDebtBridgeMock {
    function getFlashLoanRoute(address _tokenA, uint256 _wTokenADebtToMove)
        public
        view
        returns (uint256)
    {
        return _getFlashLoanRoute(_tokenA, _wTokenADebtToMove);
    }

    function getRealisedDebt(uint256 _debtToMove)
        public
        pure
        returns (uint256)
    {
        return _getRealisedDebt(_debtToMove);
    }
}

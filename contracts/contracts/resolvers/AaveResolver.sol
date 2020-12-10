// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import {_getPosition, _percentDiv} from "../../functions/dapps/FAave.sol";
import {
    ILendingPool,
    AaveUserData,
    TokenPrice
} from "../../interfaces/dapps/Aave/ILendingPool.sol";

contract AaveResolver {
    function getPosition(address user)
        public
        view
        returns (AaveUserData memory)
    {
        return _getPosition(user);
    }

    function percentDiv(uint256 value, uint256 percentage)
        public
        pure
        returns (uint256)
    {
        return _percentDiv(value, percentage);
    }
}

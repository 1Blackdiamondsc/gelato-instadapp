// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {_getPrice} from "../../functions/dapps/FChainlink.sol";

contract ChainlinkResolver {
    function getPrice(address _token) public view returns (uint256) {
        return _getPrice(_token);
    }
}

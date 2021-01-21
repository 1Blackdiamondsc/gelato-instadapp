// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {
    IAggregatorV3Interface
} from "../../interfaces/dapps/Chainlink/IAggregatorV3Interface.sol";
import {_convertIntToUint} from "../../vendor/Convert.sol";

function _getPrice(address _aggregatorV3Interface) view returns (uint256) {
    IAggregatorV3Interface priceFeed =
        IAggregatorV3Interface(_aggregatorV3Interface);
    (, int256 price, , , ) = priceFeed.latestRoundData();

    return _convertIntToUint(price);
}

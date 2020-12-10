// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;

interface ChainLinkInterface {
    function latestAnswer() external view returns (int256);

    function decimals() external view returns (uint256);
}

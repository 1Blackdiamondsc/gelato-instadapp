// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;

function GAS_COSTS_FOR_FULL_REFINANCE_MAKER_TO_MAKER()
    pure
    returns (uint256[4] memory)
{
    return [uint256(2519000), 3140500, 3971000, 4345000];
}

function GAS_COSTS_FOR_FULL_REFINANCE_MAKER_TO_COMPOUND()
    pure
    returns (uint256[4] memory)
{
    return [uint256(2028307), 2626711, 2944065, 3698800];
}

function GAS_COSTS_FOR_FULL_REFINANCE_MAKER_TO_AAVE()
    pure
    returns (uint256[4] memory)
{
    return [uint256(2358534), 2956937, 3381960, 4029400];
}

uint256 constant PREMIUM = 30;
uint256 constant VAULT_CREATION_COST = 200000;

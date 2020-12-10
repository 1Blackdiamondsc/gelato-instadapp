// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;

import {
    IAaveProtocolDataProvider
} from "../../interfaces/dapps/Aave/IAaveProtocolDataProvider.sol";
import {
    IAavePriceOracle
} from "../../interfaces/dapps/Aave/IAavePriceOracle.sol";
import {
    ILendingPoolAddressesProvider
} from "../../interfaces/dapps/Aave/ILendingPoolAddressesProvider.sol";
import {
    ChainLinkInterface
} from "../../interfaces/dapps/Aave/ChainLinkInterface.sol";
import {
    ILendingPool,
    AaveUserData,
    TokenPrice,
    AaveTokenData
} from "../../interfaces/dapps/Aave/ILendingPool.sol";
import {
    LENDING_POOL_ADDRESSES_PROVIDER,
    CHAINLINK_ETH_FEED,
    AAVE_PROTOCOL_DATA_PROVIDER
} from "../../constants/CAave.sol";
import {ETH, WETH} from "../../constants/CInstaDapp.sol";
import {wmul} from "../../vendor/DSMath.sol";

function _getEtherPrice() view returns (uint256 ethPrice) {
    ethPrice = uint256(ChainLinkInterface(CHAINLINK_ETH_FEED).latestAnswer());
}

function _getUserData(
    ILendingPool aave,
    address user,
    uint256 ethPriceInUsd
) view returns (AaveUserData memory userData) {
    (
        uint256 totalCollateralETH,
        uint256 totalDebtETH,
        uint256 availableBorrowsETH,
        uint256 currentLiquidationThreshold,
        uint256 ltv,
        uint256 healthFactor
    ) = aave.getUserAccountData(user);

    userData = AaveUserData(
        totalCollateralETH,
        totalDebtETH,
        availableBorrowsETH,
        currentLiquidationThreshold,
        ltv,
        healthFactor,
        ethPriceInUsd
    );
}

function _getPosition(address user) view returns (AaveUserData memory) {
    ILendingPoolAddressesProvider addrProvider =
        ILendingPoolAddressesProvider(LENDING_POOL_ADDRESSES_PROVIDER);

    uint256 ethPrice = _getEtherPrice();

    return (
        _getUserData(
            ILendingPool(addrProvider.getLendingPool()),
            user,
            ethPrice
        )
    );
}

function _percentDiv(uint256 value, uint256 percentage) pure returns (uint256) {
    require(percentage != 0, "Division Error");
    uint256 percentageFactor = 1e4; //percentage plus two decimals
    uint256 halfPercentage = percentage / 2;

    require(
        value <= (type(uint256).max - halfPercentage) / percentageFactor,
        "Multiplication Overflow"
    );

    return (value * percentageFactor + halfPercentage) / percentage;
}

function _collateralData(address token)
    view
    returns (AaveTokenData memory aaveTokenData)
{
    IAaveProtocolDataProvider aaveData =
        IAaveProtocolDataProvider(AAVE_PROTOCOL_DATA_PROVIDER);
    (, aaveTokenData.ltv, , , , , , , , ) = aaveData
        .getReserveConfigurationData(token);
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {
    IAaveProtocolDataProvider
} from "../../interfaces/dapps/Aave/IAaveProtocolDataProvider.sol";
import {
    ILendingPoolAddressesProvider
} from "../../interfaces/dapps/Aave/ILendingPoolAddressesProvider.sol";
import {
    ChainLinkInterface
} from "../../interfaces/dapps/Aave/ChainLinkInterface.sol";
import {ILendingPool} from "../../interfaces/dapps/Aave/ILendingPool.sol";
import {WETH, ETH} from "../../constants/CTokens.sol";
import {AaveUserData} from "../../structs/SAave.sol";
import {
    LENDING_POOL_ADDRESSES_PROVIDER,
    CHAINLINK_ETH_FEED,
    AAVE_PROTOCOL_DATA_PROVIDER,
    LENDING_POOL_CORE_V1
} from "../../constants/CAave.sol";
import {ETH, WETH} from "../../constants/CTokens.sol";
import {IERC20} from "../../interfaces/dapps/IERC20.sol";

function _getEtherPrice() view returns (uint256 ethPrice) {
    ethPrice = uint256(ChainLinkInterface(CHAINLINK_ETH_FEED).latestAnswer());
}

function _getUserData(address user)
    view
    returns (AaveUserData memory userData)
{
    (
        uint256 totalCollateralETH,
        uint256 totalDebtETH,
        uint256 availableBorrowsETH,
        uint256 currentLiquidationThreshold,
        uint256 ltv,
        uint256 healthFactor
    ) =
        ILendingPool(
            ILendingPoolAddressesProvider(LENDING_POOL_ADDRESSES_PROVIDER)
                .getLendingPool()
        )
            .getUserAccountData(user);

    userData = AaveUserData(
        totalCollateralETH,
        totalDebtETH,
        availableBorrowsETH,
        currentLiquidationThreshold,
        ltv,
        healthFactor,
        _getEtherPrice()
    );
}

function _getAssetLiquidationThreshold(address _token)
    view
    returns (uint256 liquidationThreshold)
{
    (, , liquidationThreshold, , , , , , , ) = IAaveProtocolDataProvider(
        AAVE_PROTOCOL_DATA_PROVIDER
    )
        .getReserveConfigurationData(_getTokenAddr(_token));
}

function _getTokenAddr(address _token) pure returns (address) {
    return _token == ETH ? WETH : _token;
}

function _getTokenLiquidity(address _token) view returns (uint256) {
    return
        IERC20(_token).balanceOf(
            ILendingPool(
                ILendingPoolAddressesProvider(LENDING_POOL_ADDRESSES_PROVIDER)
                    .getLendingPool()
            )
                .getReserveData(_token)
                .aTokenAddress
        );
}

function _isAaveUnderlyingLiquid(address _debtToken, uint256 _debtAmt)
    view
    returns (bool)
{
    return _getTokenLiquidity(_debtToken) > _debtAmt;
}

function _isAaveUnderlyingLiquidV1(address _debtToken, uint256 _debtAmt)
    view
    returns (bool)
{
    return IERC20(_debtToken).balanceOf(LENDING_POOL_CORE_V1) > _debtAmt;
}

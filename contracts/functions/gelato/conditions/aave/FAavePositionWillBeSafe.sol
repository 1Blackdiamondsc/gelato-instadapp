// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {
    _getUserData,
    _getAssetLiquidationThreshold
} from "../../../../functions/dapps/FAave.sol";
import {AaveUserData} from "../../../../structs/SAave.sol";
import {GelatoBytes} from "../../../../lib/GelatoBytes.sol";
import {wdiv, wmul, mul} from "../../../../vendor/DSMath.sol";
import {
    DAI_ETH_PRICEFEEDER,
    ETH_ETH_PRICEFEEDER
} from "../../../../constants/CChainlink.sol";
import {_getPrice} from "../../../dapps/FChainlink.sol";

function _aavePositionWillBeSafe(
    address _dsa,
    uint256 _colAmt,
    address _colToken,
    uint256 _debtAmt,
    address _priceChainlinkOracle
) view returns (bool) {
    uint256 _colAmtInETH;

    AaveUserData memory userData = _getUserData(_dsa);

    if (_priceChainlinkOracle == ETH_ETH_PRICEFEEDER) _colAmtInETH = _colAmt;
    else _colAmtInETH = wmul(_colAmt, _getPrice(_priceChainlinkOracle));

    //
    //                  __
    //                  \
    //                  /__ (Collateral)i in ETH x (Liquidation Threshold)i
    //  HealthFactor =  _________________________________________________
    //
    //                  Total Borrows in ETH + Total Fees in ETH
    //

    return
        wdiv(
            (
                (mul(
                    userData.currentLiquidationThreshold,
                    userData.totalCollateralETH
                ) + mul(_colAmtInETH, _getAssetLiquidationThreshold(_colToken)))
            ) / 1e4,
            userData.totalBorrowsETH +
                wmul(_debtAmt, _getPrice(DAI_ETH_PRICEFEEDER))
        ) > 1e18;
}

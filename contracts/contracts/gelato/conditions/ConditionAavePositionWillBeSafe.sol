// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import {
    GelatoConditionsStandard
} from "@gelatonetwork/core/contracts/conditions/GelatoConditionsStandard.sol";
import {GelatoBytes} from "../../../lib/GelatoBytes.sol";
import {
    _getMakerVaultDebt,
    _getMakerVaultCollateralBalance
} from "../../../functions/dapps/FMaker.sol";
import {DAI} from "../../../constants/CInstaDapp.sol";
import {
    _getFlashLoanRoute,
    _getGasCostMakerToMaker,
    _getRealisedDebt
} from "../../../functions/gelato/FGelatoDebtBridge.sol";
import {_getGelatoExecutorFees} from "../../../functions/gelato/FGelato.sol";
import {
    _getPosition,
    _percentDiv,
    _collateralData
} from "../../../functions/dapps/FAave.sol";
import {add, sub, mul} from "../../../vendor/DSMath.sol";
import {
    AaveUserData,
    AaveTokenData
} from "../../../interfaces/dapps/Aave/ILendingPool.sol";
import "hardhat/console.sol";

contract ConditionAavePositionWillBeSafe is GelatoConditionsStandard {
    using GelatoBytes for bytes;

    function getConditionData(
        address _dsa,
        uint256 _fromVaultId,
        address _priceOracle,
        bytes memory _oraclePayload
    ) public pure virtual returns (bytes memory) {
        return
            abi.encodeWithSelector(
                this.destPositionIsSafe.selector,
                _dsa,
                _fromVaultId,
                _priceOracle,
                _oraclePayload
            );
    }

    function ok(
        uint256,
        bytes calldata _conditionData,
        uint256
    ) public view virtual override returns (string memory) {
        (
            address _dsa,
            uint256 _fromVaultId,
            address _priceOracle,
            bytes memory _oraclePayload
        ) = abi.decode(_conditionData[4:], (address, uint256, address, bytes));

        return
            destPositionIsSafe(
                _dsa,
                _fromVaultId,
                _priceOracle,
                _oraclePayload
            );
    }

    /* solhint-disable function-max-lines */

    function destPositionIsSafe(
        address _dsa,
        uint256 _fromVaultId,
        address _priceOracle,
        bytes memory _oraclePayload
    ) public view returns (string memory) {
        uint256 wDaiToBorrow =
            _getRealisedDebt(_getMakerVaultDebt(_fromVaultId));
        uint256 wColToDeposit =
            sub(
                _getMakerVaultCollateralBalance(_fromVaultId),
                _getGelatoExecutorFees(
                    _getGasCostMakerToMaker(
                        false,
                        _getFlashLoanRoute(DAI, wDaiToBorrow)
                    )
                )
            );

        (bool success, bytes memory returndata) =
            _priceOracle.staticcall(_oraclePayload);

        if (!success) {
            returndata.revertWithError(
                "ConditionDestPositionWillBeSafe.destPositionIsSafe:oracle:"
            );
        }

        uint256 colPriceInWad = abi.decode(returndata, (uint256));

        AaveUserData memory userData = _getPosition(_dsa);
        AaveTokenData memory tokenData = _collateralData(DAI);

        return
            overCollateralized(
                add(
                    userData.totalBorrowsETH,
                    mul(wDaiToBorrow / colPriceInWad, 1e8)
                ),
                tokenData.ltv,
                add(userData.totalCollateralETH, wColToDeposit)
            )
                ? OK
                : "DestPositionWillNotBeSafe";
    }

    /* solhint-enable function-max-lines */

    function overCollateralized(
        uint256 totalBorrowETH,
        uint256 totalCollateralETH,
        uint256 ltv
    ) public view returns (bool) {
        return _percentDiv(totalBorrowETH, ltv) <= totalCollateralETH;
    }
}

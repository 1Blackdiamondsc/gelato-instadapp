// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import {
    GelatoConditionsStandard
} from "@gelatonetwork/core/contracts/gelato_conditions/GelatoConditionsStandard.sol";
import {GelatoBytes} from "../../../../lib/GelatoBytes.sol";
import {IERC20} from "../../../../interfaces/dapps/IERC20.sol";
import {
    ILendingPoolAddressesProvider
} from "../../../../interfaces/dapps/Aave/ILendingPoolAddressesProvider.sol";
import {ILendingPool} from "../../../../interfaces/dapps/Aave/ILendingPool.sol";
import {LENDING_POOL_ADDRESSES_PROVIDER} from "../../../../constants/CAave.sol";
import {
    _getRealisedDebt
} from "../../../../functions/gelato/FGelatoDebtBridge.sol";
import {_getMakerVaultDebt} from "../../../../functions/dapps/FMaker.sol";

contract ConditionAaveHasLiquidity is GelatoConditionsStandard {
    using GelatoBytes for bytes;

    function getConditionData(address _tokenToBorrow, uint256 _fromVaultId)
        public
        pure
        virtual
        returns (bytes memory)
    {
        return
            abi.encodeWithSelector(
                this.hasLiquidty.selector,
                _tokenToBorrow,
                _fromVaultId
            );
    }

    function ok(
        uint256,
        bytes calldata _conditionData,
        uint256
    ) public view virtual override returns (string memory) {
        (address _tokenToBorrow, uint256 _fromVaultId) =
            abi.decode(_conditionData[4:], (address, uint256));

        return hasLiquidty(_tokenToBorrow, _fromVaultId);
    }

    function hasLiquidty(address _tokenToBorrow, uint256 _fromVaultId)
        public
        view
        returns (string memory)
    {
        IERC20 token = IERC20(_tokenToBorrow);
        uint256 wDaiToBorrow =
            _getRealisedDebt(_getMakerVaultDebt(_fromVaultId));

        address aTokenAddress =
            ILendingPool(
                ILendingPoolAddressesProvider(LENDING_POOL_ADDRESSES_PROVIDER)
                    .getLendingPool()
            )
                .getReserveData(_tokenToBorrow)
                .aTokenAddress;
        // Check if Aave have enough liquidity to do the debt bridge action.

        return
            token.balanceOf(aTokenAddress) > wDaiToBorrow
                ? OK
                : "AaveHasNotEnoughLiquidity";
    }
}

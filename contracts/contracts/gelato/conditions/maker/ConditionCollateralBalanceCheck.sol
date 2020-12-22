// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {
    GelatoConditionsStandard
} from "@gelatonetwork/core/contracts/gelato_conditions/GelatoConditionsStandard.sol";
import {GelatoBytes} from "../../../../lib/GelatoBytes.sol";
import {
    _getMakerVaultCollateralBalance,
    _isVaultOwner
} from "../../../../functions/dapps/FMaker.sol";

contract ConditionCollateralBalanceCheck is GelatoConditionsStandard {
    using GelatoBytes for bytes;

    function getConditionData(address _dsa, uint256 _vaultId)
        public
        pure
        virtual
        returns (bytes memory)
    {
        return
            abi.encodeWithSelector(
                this.isCollateralEnough.selector,
                _dsa,
                _vaultId
            );
    }

    function ok(
        uint256,
        bytes calldata _conditionData,
        uint256
    ) public view virtual override returns (string memory) {
        (address _dsa, uint256 _vaultId) =
            abi.decode(_conditionData[4:], (address, uint256));

        return isCollateralEnough(_dsa, _vaultId);
    }

    function isCollateralEnough(address _dsa, uint256 _vaultId)
        public
        view
        returns (string memory)
    {
        require(
            _isVaultOwner(_vaultId, _dsa),
            "ConditionCollateralBalanceCheck.isBorrowAmountDust: dsa isn't the owner of the vault"
        );

        return
            _getMakerVaultCollateralBalance(_vaultId) >= 10 ether
                ? OK
                : "CollateralLockedNotEnough";
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {
    GelatoConditionsStandard
} from "@gelatonetwork/core/contracts/gelato_conditions/GelatoConditionsStandard.sol";
import {
    _aavePositionWillBeSafe
} from "../../../../functions/gelato/conditions/aave/FAavePositionWillBeSafe.sol";
import {
    _getMakerVaultCollateralBalance
} from "../../../../functions/dapps/FMaker.sol";
import {
    _getMaxAmtToBorrowMakerToAave
} from "../../../../functions/gelato/FGelatoDebtBridge.sol";

contract ConditionMakerToAaveSafe is GelatoConditionsStandard {
    uint256 public immutable fees;

    constructor(uint256 _fees) {
        fees = _fees;
    }

    function getConditionData(
        address _dsa,
        uint256 _fromVaultId,
        address _colToken,
        address _priceOracle
    ) public pure virtual returns (bytes memory) {
        return
            abi.encodeWithSelector(
                this.aavePositionWillBeSafe.selector,
                _dsa,
                _fromVaultId,
                _colToken,
                _priceOracle
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
            address _colToken,
            address _priceOracle
        ) =
            abi.decode(
                _conditionData[4:],
                (address, uint256, address, address)
            );

        return
            aavePositionWillBeSafe(_dsa, _fromVaultId, _colToken, _priceOracle);
    }

    function aavePositionWillBeSafe(
        address _dsa,
        uint256 _fromVaultId,
        address _colToken,
        address _priceOracle
    ) public view returns (string memory) {
        return
            _aavePositionWillBeSafe(
                _dsa,
                _getMakerVaultCollateralBalance(_fromVaultId),
                _colToken,
                _getMaxAmtToBorrowMakerToAave(_fromVaultId, fees),
                _priceOracle
            )
                ? OK
                : "AavePositionWillNotBeSafe";
    }
}

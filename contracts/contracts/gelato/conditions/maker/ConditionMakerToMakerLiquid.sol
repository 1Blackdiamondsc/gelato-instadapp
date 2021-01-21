// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {
    GelatoConditionsStandard
} from "@gelatonetwork/core/contracts/gelato_conditions/GelatoConditionsStandard.sol";
import {GelatoBytes} from "../../../../lib/GelatoBytes.sol";
import {
    _isDebtCeilingReached
} from "../../../../functions/gelato/conditions/maker/FDebtCeilingIsReached.sol";
import {
    _getMaxAmtToBorrowMakerToMaker
} from "../../../../functions/gelato/FGelatoDebtBridge.sol";

contract ConditionMakerToMakerLiquid is GelatoConditionsStandard {
    using GelatoBytes for bytes;

    uint256 public immutable fees;

    constructor(uint256 _fees) {
        fees = _fees;
    }

    function getConditionData(
        address _dsa,
        uint256 _fromVaultId,
        uint256 _destVaultId,
        string calldata _destColType
    ) public pure virtual returns (bytes memory) {
        return
            abi.encodeWithSelector(
                this.isDebtCeilingReached.selector,
                _dsa,
                _fromVaultId,
                _destVaultId,
                _destColType
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
            uint256 _destVaultId,
            string memory _destColType
        ) = abi.decode(_conditionData[4:], (address, uint256, uint256, string));

        return
            isDebtCeilingReached(
                _dsa,
                _fromVaultId,
                _destVaultId,
                _destColType
            );
    }

    function isDebtCeilingReached(
        address _dsa,
        uint256 _fromVaultId,
        uint256 _destVaultId,
        string memory _destColType
    ) public view returns (string memory) {
        return
            _isDebtCeilingReached(
                _dsa,
                _destVaultId,
                _destColType,
                _getMaxAmtToBorrowMakerToMaker(
                    _fromVaultId,
                    _destVaultId == 0,
                    fees
                )
            )
                ? "MakerDebtCeilingReached"
                : OK;
    }
}

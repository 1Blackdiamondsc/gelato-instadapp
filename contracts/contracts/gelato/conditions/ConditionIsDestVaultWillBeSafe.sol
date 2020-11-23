// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import {
    GelatoConditionsStandard
} from "@gelatonetwork/core/contracts/conditions/GelatoConditionsStandard.sol";
import {
    _getMakerVaultDebt,
    _getMakerVaultCollateralBalance,
    _isVaultWillBeSafe,
    _isNewVaultWillBeSafe
} from "../../../functions/dapps/FMaker.sol";
import {
    _getRealisedDebt
} from "../../../functions/gelato/FGelatoDebtBridge.sol";

import {GelatoBytes} from "../../../lib/GelatoBytes.sol";
import "hardhat/console.sol";

contract ConditionIsDestVaultWillBeSafe is GelatoConditionsStandard {
    using GelatoBytes for bytes;

    function getConditionData(
        uint256 _fromVaultId,
        uint256 _destVaultId,
        string memory _destColType
    ) public pure virtual returns (bytes memory) {
        return abi.encode(_fromVaultId, _destVaultId, _destColType);
    }

    function ok(
        uint256,
        bytes calldata _conditionData,
        uint256
    ) public view virtual override returns (string memory) {
        (
            uint256 _fromVaultId,
            uint256 _destVaultId,
            string memory _destColType
        ) = abi.decode(_conditionData, (uint256, uint256, string));

        return destVaultWillBeSafe(_fromVaultId, _destVaultId, _destColType);
    }

    function destVaultWillBeSafe(
        uint256 _fromVaultId,
        uint256 _destVaultId,
        string memory _destColType
    ) public view returns (string memory) {
        uint256 wDaiToBorrow =
            _getRealisedDebt(_getMakerVaultDebt(_fromVaultId));
        uint256 wColToDeposit = _getMakerVaultCollateralBalance(_fromVaultId);

        return
            isDestVaultWillBeSafe(
                _destVaultId,
                wDaiToBorrow,
                wColToDeposit,
                _destColType
            )
                ? OK
                : "DestVaultWillNotBeSafe";
    }

    function isDestVaultWillBeSafe(
        uint256 _vaultId,
        uint256 _wDaiToBorrow,
        uint256 _wColToDeposit,
        string memory _colType
    ) public view returns (bool) {
        return
            _vaultId == 0
                ? _isNewVaultWillBeSafe(_colType, _wDaiToBorrow, _wColToDeposit)
                : _isVaultWillBeSafe(_vaultId, _wDaiToBorrow, _wColToDeposit);
    }
}

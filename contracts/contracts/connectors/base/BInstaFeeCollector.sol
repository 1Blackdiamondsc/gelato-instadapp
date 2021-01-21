// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {
    IBInstaFeeCollector
} from "../../../interfaces/InstaDapp/connectors/base/IBInstaFeeCollector.sol";
import {
    Ownable
} from "../../../vendor/openzeppelin/contracts/access/Ownable.sol";

abstract contract BInstaFeeCollector is IBInstaFeeCollector, Ownable {
    uint256 public immutable override fee;

    address payable public override feeCollector;
    uint256 public override minDebt;

    address internal immutable _connectGelatoDebtBridgeFee;

    constructor(
        uint256 _fee,
        address payable _feeCollector,
        uint256 _minDebt,
        address __connectGelatoDebtBridgeFee
    ) {
        fee = _fee;
        feeCollector = _feeCollector;
        minDebt = _minDebt;
        _connectGelatoDebtBridgeFee = __connectGelatoDebtBridgeFee;
    }

    function setFeeCollector(address payable _feeCollector)
        external
        override
        onlyOwner
    {
        feeCollector = _feeCollector;
    }

    function setMinDebt(uint256 _minDebt) external override onlyOwner {
        minDebt = _minDebt;
    }
}

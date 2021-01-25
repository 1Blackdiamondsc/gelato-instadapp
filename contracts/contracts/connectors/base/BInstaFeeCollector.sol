// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {
    IBInstaFeeCollector
} from "../../../interfaces/InstaDapp/connectors/base/IBInstaFeeCollector.sol";
import {
    Ownable
} from "../../../vendor/openzeppelin/contracts/access/Ownable.sol";
import {MAX_INSTA_FEE} from "../../../constants/CDebtBridge.sol";

abstract contract BInstaFeeCollector is IBInstaFeeCollector, Ownable {
    uint256 public override fee;

    address payable public override feeCollector;

    address internal immutable _connectGelatoDebtBridgeFee;

    constructor(
        uint256 _fee,
        address payable _feeCollector,
        address __connectGelatoDebtBridgeFee
    ) {
        fee = _fee;
        feeCollector = _feeCollector;
        _connectGelatoDebtBridgeFee = __connectGelatoDebtBridgeFee;
    }

    function setFeeCollector(address payable _feeCollector)
        external
        override
        onlyOwner
    {
        feeCollector = _feeCollector;
    }

    function setFee(uint256 _fee) external override onlyOwner {
        require(
            _fee <= MAX_INSTA_FEE,
            "BInstaFeeCollector.setFee: New fee value is too high."
        );
        fee = _fee;
    }
}

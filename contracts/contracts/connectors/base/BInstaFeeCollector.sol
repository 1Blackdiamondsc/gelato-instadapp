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
    uint256 public override minCol;

    constructor(
        uint256 _fee,
        address payable _feeCollector,
        uint256 _minCol
    ) {
        fee = _fee;
        feeCollector = _feeCollector;
        minCol = _minCol;
    }

    function setFeeCollector(address payable _feeCollector)
        external
        override
        onlyOwner
    {
        feeCollector = _feeCollector;
    }

    function setMinCol(uint256 _minCol) external override onlyOwner {
        minCol = _minCol;
    }
}

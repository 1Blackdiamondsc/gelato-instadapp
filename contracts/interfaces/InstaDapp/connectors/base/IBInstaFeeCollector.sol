// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

interface IBInstaFeeCollector {
    function setFeeCollector(address payable _feeCollector) external;

    function setMinCol(uint256 _minCol) external;

    function fee() external view returns (uint256);

    function feeCollector() external view returns (address payable);

    function minCol() external view returns (uint256);
}

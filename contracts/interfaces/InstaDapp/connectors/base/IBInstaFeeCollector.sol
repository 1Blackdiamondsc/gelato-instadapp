// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

interface IBInstaFeeCollector {
    function setFeeCollector(address payable _feeCollector) external;

    function setMinDebt(uint256 _minDebt) external;

    function fee() external view returns (uint256);

    function feeCollector() external view returns (address payable);

    function minDebt() external view returns (uint256);
}

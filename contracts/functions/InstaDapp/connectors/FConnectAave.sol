// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;

import {
    IConnectAave
} from "../../../interfaces/InstaDapp/connectors/IConnectAave.sol";

function _encodeDepositAave(
    address _token,
    uint256 _amt,
    uint256 _getId,
    uint256 _setId
) pure returns (bytes memory) {
    return
        abi.encodeWithSelector(
            IConnectAave.deposit.selector,
            _token,
            _amt,
            _getId,
            _setId
        );
}

function _encodeBorrowAave(
    address _token,
    uint256 _amt,
    uint256 _rateMode, // 1 for Stable and 2 for variable
    uint256 _getId,
    uint256 _setId
) pure returns (bytes memory) {
    return
        abi.encodeWithSelector(
            IConnectAave.borrow.selector,
            _token,
            _amt,
            _rateMode,
            _getId,
            _setId
        );
}

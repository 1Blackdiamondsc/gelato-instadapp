// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;

import {
    IConnectGelatoProviderPayment
} from "../../../interfaces/InstaDapp/connectors/IConnectGelatoProviderPayment.sol";

function _encodePayGelatoProvider(
    address _provider,
    address _token,
    uint256 _amt,
    uint256 _getId,
    uint256 _setId
) pure returns (bytes memory) {
    return
        abi.encodeWithSelector(
            IConnectGelatoProviderPayment.payProvider.selector,
            _provider,
            _token,
            _amt,
            _getId,
            _setId
        );
}

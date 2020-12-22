// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {BInstaFeeCollector} from "../../base/BInstaFeeCollector.sol";
import {
    IBInstaFeeCollector
} from "../../../../interfaces/InstaDapp/connectors/base/IBInstaFeeCollector.sol";
import {GelatoBytes} from "../../../../lib/GelatoBytes.sol";
import {
    DataFlow
} from "@gelatonetwork/core/contracts/gelato_core/interfaces/IGelatoCore.sol";
import {
    AccountInterface,
    ConnectorInterface
} from "../../../../interfaces/InstaDapp/IInstaDapp.sol";
import {
    IConnectInstaPoolV2
} from "../../../../interfaces/InstaDapp/connectors/IConnectInstaPoolV2.sol";
import {
    DAI,
    CONNECT_MAKER,
    CONNECT_AAVE_V2,
    INSTA_POOL_V2,
    CONNECT_BASIC,
    CONNECT_FEE
} from "../../../../constants/CInstaDapp.sol";
import {
    _getMakerVaultDebt,
    _getMakerVaultCollateralBalance,
    _isVaultOwner
} from "../../../../functions/dapps/FMaker.sol";
import {
    _getFlashLoanRoute,
    _getRealisedDebt
} from "../../../../functions/gelato/FGelatoDebtBridge.sol";
import {
    _encodePaybackMakerVault,
    _encodedWithdrawMakerVault
} from "../../../../functions/InstaDapp/connectors/FConnectMaker.sol";
import {
    _encodeCalculateFee
} from "../../../../functions/InstaDapp/connectors/FConnectFee.sol";
import {
    _encodeDepositAave,
    _encodeBorrowAave
} from "../../../../functions/InstaDapp/connectors/FConnectAave.sol";
import {
    _encodeBasicWithdraw
} from "../../../../functions/InstaDapp/connectors/FConnectBasic.sol";
import {
    _encodeFlashPayback
} from "../../../../functions/InstaDapp/connectors/FInstaPoolV2.sol";

contract ConnectGelatoDataFullMakerToAave is
    ConnectorInterface,
    BInstaFeeCollector
{
    using GelatoBytes for bytes;

    string public constant OK = "OK";

    // solhint-disable const-name-snakecase
    string public constant override name =
        "ConnectGelatoDataFullMakerToAave-v1.0";
    uint256 internal immutable _id;
    address public immutable connectGelatoDataFullMakerToAaveAddr;

    constructor(
        uint256 id,
        uint256 _fee,
        address payable _feeCollector,
        uint256 _minCol
    ) BInstaFeeCollector(_fee, _feeCollector, _minCol) {
        _id = id;
        connectGelatoDataFullMakerToAaveAddr = address(this);
    }

    /// @dev Connector Details
    function connectorID()
        external
        view
        override
        returns (uint256 _type, uint256 id)
    {
        (_type, id) = (1, _id); // Should put specific value.
    }

    // ====== ACTION TERMS CHECK ==========
    // Overriding IGelatoAction's function (optional)
    function termsOk(
        uint256, // taskReceipId
        address _dsa,
        bytes calldata _actionData,
        DataFlow,
        uint256, // value
        uint256 // cycleId
    ) public view returns (string memory) {
        (uint256 vaultId, ) = abi.decode(_actionData[4:], (uint256, address));

        if (vaultId == 0)
            return "ConnectGelatoDataFullMakerToAave: Vault Id is not valid";
        if (!_isVaultOwner(vaultId, _dsa))
            return "ConnectGelatoDataFullMakerToAave: Vault not owned by dsa";
        if (_getMakerVaultCollateralBalance(vaultId) < minCol)
            return "ConnectGelatoDataFullMakerToAave: col < minCol";
        return OK;
    }

    /// @notice Entry Point for DSA.cast DebtBridge from e.g ETH-A to ETH-B
    /// @dev payable to be compatible in conjunction with DSA.cast payable target
    /// @param _vaultId Id of the unsafe vault of the client of Vault A Collateral.
    /// @param _colToken  vault's col token address .
    function getDataAndCastMakerToAave(uint256 _vaultId, address _colToken)
        external
        payable
    {
        (address[] memory targets, bytes[] memory datas) =
            _dataMakerToAave(_vaultId, _colToken);

        _cast(targets, datas);
    }

    function _cast(address[] memory targets, bytes[] memory datas) internal {
        // Instapool V2 / FlashLoan call
        bytes memory castData =
            abi.encodeWithSelector(
                AccountInterface.cast.selector,
                targets,
                datas,
                msg.sender // msg.sender == GelatoCore
            );

        (bool success, bytes memory returndata) =
            address(this).delegatecall(castData);
        if (!success) {
            returndata.revertWithError(
                "ConnectGelatoDataFullMakerToAave._cast:"
            );
        }
    }

    /* solhint-disable function-max-lines */

    function _dataMakerToAave(uint256 _vaultId, address _colToken)
        internal
        view
        returns (address[] memory targets, bytes[] memory datas)
    {
        address[] memory _targets;
        bytes[] memory _datas;
        targets = new address[](1);
        targets[0] = INSTA_POOL_V2;

        uint256 wDaiToBorrow = _getRealisedDebt(_getMakerVaultDebt(_vaultId));
        uint256 wColToWithdrawFromMaker =
            _getMakerVaultCollateralBalance(_vaultId);
        uint256 route = _getFlashLoanRoute(DAI, wDaiToBorrow);

        (_targets, _datas) = _spellsMakerToAave(
            _vaultId,
            _colToken,
            wDaiToBorrow,
            wColToWithdrawFromMaker
        );

        datas = new bytes[](1);
        datas[0] = abi.encodeWithSelector(
            IConnectInstaPoolV2.flashBorrowAndCast.selector,
            DAI,
            wDaiToBorrow,
            route,
            abi.encode(_targets, _datas)
        );
    }

    function _spellsMakerToAave(
        uint256 _vaultId,
        address _colToken,
        uint256 _wDaiToBorrow,
        uint256 _wColToWithdrawFromMaker
    ) internal view returns (address[] memory targets, bytes[] memory datas) {
        targets = new address[](7);
        targets[0] = CONNECT_MAKER; // payback
        targets[1] = CONNECT_MAKER; // withdraw
        targets[2] = CONNECT_FEE; // calculate fee
        targets[3] = CONNECT_AAVE_V2; // deposit
        targets[4] = CONNECT_AAVE_V2; // borrow
        targets[5] = CONNECT_BASIC; // user pay fee to fee collector
        targets[6] = INSTA_POOL_V2; // flashPayback

        datas = new bytes[](7);
        datas[0] = _encodePaybackMakerVault(
            _vaultId,
            type(uint256).max,
            0,
            600
        );
        datas[1] = _encodedWithdrawMakerVault(
            _vaultId,
            type(uint256).max,
            0,
            0
        );
        datas[2] = _encodeCalculateFee(
            0,
            IBInstaFeeCollector(connectGelatoDataFullMakerToAaveAddr).fee(),
            600,
            600,
            601
        );
        datas[3] = _encodeDepositAave(
            _colToken,
            _wColToWithdrawFromMaker,
            0,
            0
        );
        datas[4] = _encodeBorrowAave(DAI, 0, 2, 600, 0); // Variable rate by default.
        datas[5] = _encodeBasicWithdraw(
            DAI,
            0,
            IBInstaFeeCollector(connectGelatoDataFullMakerToAaveAddr)
                .feeCollector(),
            601,
            0
        );
        datas[6] = _encodeFlashPayback(DAI, _wDaiToBorrow, 0, 0);
    }

    /* solhint-enable function-max-lines */
}

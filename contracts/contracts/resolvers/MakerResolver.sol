// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.0;

import {
    _getMakerRawVaultDebt,
    _getMakerVaultDebt,
    _getMakerVaultCollateralBalance,
    _vaultWillBeSafe,
    _newVaultWillBeSafe,
    _stringToBytes32
} from "../../functions/dapps/FMaker.sol";
import {MCD_MANAGER} from "../../constants/CMaker.sol";
import {IMcdManager} from "../../interfaces/dapps/Maker/IMcdManager.sol";
import {IVat} from "../../interfaces/dapps/Maker/IVat.sol";
import {
    _isDebtAmtDustExplicit
} from "../../functions/gelato/conditions/maker/FIsDebtAmtDust.sol";
import {
    _debtCeilingIsReachedExplicit
} from "../../functions/gelato/conditions/maker/FDebtCeilingIsReached.sol";

contract MakerResolver {
    /// @dev Return Debt in wad of the vault associated to the vaultId.
    function getMakerVaultRawDebt(uint256 _vaultId)
        public
        view
        returns (uint256)
    {
        return _getMakerRawVaultDebt(_vaultId);
    }

    function getMakerVaultDebt(uint256 _vaultId) public view returns (uint256) {
        return _getMakerVaultDebt(_vaultId);
    }

    /// @dev Return Collateral in wad of the vault associated to the vaultId.
    function getMakerVaultCollateralBalance(uint256 _vaultId)
        public
        view
        returns (uint256)
    {
        return _getMakerVaultCollateralBalance(_vaultId);
    }

    function vaultWillBeSafe(
        uint256 _vaultId,
        uint256 _colAmt,
        uint256 _daiDebtAmt
    ) public view returns (bool) {
        return _vaultWillBeSafe(_vaultId, _colAmt, _daiDebtAmt);
    }

    function newVaultWillBeSafe(
        string memory _colType,
        uint256 _colAmt,
        uint256 _daiDebtAmt
    ) public view returns (bool) {
        return _newVaultWillBeSafe(_colType, _colAmt, _daiDebtAmt);
    }

    function getMaxDebtAmt(string memory _colType)
        public
        view
        returns (uint256)
    {
        IMcdManager manager = IMcdManager(MCD_MANAGER);
        IVat vat = IVat(manager.vat());
        bytes32 ilk = _stringToBytes32(_colType);
        (uint256 art, uint256 rate, , uint256 line, ) = vat.ilks(ilk);

        return (line / rate) - art;
    }

    function debtAmtIsDust(
        uint256 _destVaultId,
        string memory _colType,
        uint256 _daiDebtAmt
    ) public view returns (bool) {
        return _isDebtAmtDustExplicit(_destVaultId, _colType, _daiDebtAmt);
    }

    function debtCeilingIsReached(
        uint256 _destVaultId,
        string memory _destColType,
        uint256 _daiDebtAmt
    ) public view returns (bool) {
        return
            _debtCeilingIsReachedExplicit(
                _destVaultId,
                _destColType,
                _daiDebtAmt
            );
    }
}

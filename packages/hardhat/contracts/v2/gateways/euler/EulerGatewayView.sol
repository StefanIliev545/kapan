// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IEulerVault, IEulerPriceOracle } from "../../interfaces/euler/IEulerVault.sol";
import { IEVC } from "../../interfaces/euler/IEVC.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/**
 * @title EulerGatewayView
 * @notice Read-only gateway for Euler V2 lending protocol
 * @dev Provides LTV queries and position data for ADL and frontend
 *
 * Sub-Account Model:
 *   - Each user has 256 possible sub-accounts (index 0-255)
 *   - Sub-account address = (userAddress & 0xFF...FF00) | subAccountIndex
 *   - Each sub-account can have at most 1 controller (debt) + N collaterals
 */
contract EulerGatewayView {
    /// @notice The Ethereum Vault Connector (EVC) singleton
    IEVC public immutable evc;

    error ZeroAddress();

    constructor(address evc_) {
        if (evc_ == address(0)) revert ZeroAddress();
        evc = IEVC(evc_);
    }

    // ============ Sub-Account Helpers ============

    /// @notice Get sub-account address from user and index
    /// @dev Sub-account = (user & 0xFF...FF00) | subAccountIndex
    ///      The user's "main" account has index = last byte of their address.
    /// @param user The user's main address
    /// @param subAccountIndex The sub-account index (0-255)
    /// @return The sub-account address
    function getSubAccount(address user, uint8 subAccountIndex) public pure returns (address) {
        return address(uint160(uint160(user) & ~uint160(0xFF)) | uint160(subAccountIndex));
    }

    /// @notice Get the user's "main" sub-account (index matches last byte of address)
    /// @param user The user's main address
    /// @return The main sub-account address and its index
    function getMainSubAccount(address user) public pure returns (address, uint8) {
        uint8 mainIndex = uint8(uint160(user) & 0xFF);
        return (getSubAccount(user, mainIndex), mainIndex);
    }

    // ============ LTV Queries (for ADL) ============

    /// @notice Returns the current LTV (debt/collateral) in basis points
    /// @dev Uses accountLiquidityFull to properly handle multi-collateral positions
    /// @param borrowVault The vault where the user has debt
    /// @param user The user address
    /// @param subAccountIndex The sub-account index
    /// @return Current LTV in basis points (e.g., 6500 = 65%)
    function getCurrentLtvBps(
        address borrowVault,
        address user,
        uint8 subAccountIndex
    ) external view returns (uint256) {
        return _calculateLtvBps(borrowVault, getSubAccount(user, subAccountIndex));
    }

    /// @notice Returns the current LTV using raw collateral/liability values
    /// @dev Alias for getCurrentLtvBps (both now use the same accurate calculation)
    /// @param borrowVault The vault where the user has debt
    /// @param user The user address
    /// @param subAccountIndex The sub-account index
    /// @return Current LTV in basis points
    function getCurrentLtvBpsSimple(
        address borrowVault,
        address user,
        uint8 subAccountIndex
    ) external view returns (uint256) {
        return _calculateLtvBps(borrowVault, getSubAccount(user, subAccountIndex));
    }

    /// @dev Internal LTV calculation that properly handles multi-collateral positions
    /// @param borrowVault The vault where the user has debt
    /// @param subAccount The sub-account address
    /// @return Current LTV in basis points (0 if no position or error)
    function _calculateLtvBps(
        address borrowVault,
        address subAccount
    ) internal view returns (uint256) {
        // Get detailed liquidity with per-collateral values
        // Note: accountLiquidityFull reverts if sub-account has no controller set
        address[] memory collaterals;
        uint256[] memory collateralValues;
        uint256 liabilityValue;

        try IEulerVault(borrowVault).accountLiquidityFull(subAccount, true) returns (
            address[] memory c,
            uint256[] memory cv,
            uint256 lv
        ) {
            collaterals = c;
            collateralValues = cv;
            liabilityValue = lv;
        } catch {
            // No position (no controller set) or other error - return 0
            return 0;
        }

        if (liabilityValue == 0) return 0;

        // Sum raw collateral values by un-adjusting each collateral's LLTV individually
        // This correctly handles positions with multiple collaterals having different LLTVs
        uint256 rawCollateralValue = 0;
        for (uint256 i = 0; i < collaterals.length; i++) {
            if (collateralValues[i] > 0) {
                uint16 lltv = IEulerVault(borrowVault).LTVLiquidation(collaterals[i]);
                if (lltv > 0) {
                    // Euler returns: adjustedValue = rawValue * LLTV / 10000
                    // So: rawValue = adjustedValue * 10000 / LLTV
                    rawCollateralValue += (collateralValues[i] * 10000) / lltv;
                }
            }
        }

        if (rawCollateralValue == 0) return 0;

        // LTV (bps) = liability * 10000 / rawCollateral
        return (liabilityValue * 10000) / rawCollateralValue;
    }

    /// @notice Returns the liquidation LTV threshold in basis points
    /// @dev Returns the minimum LLTV across all enabled collaterals
    /// @param borrowVault The vault where the user has debt
    /// @return Minimum liquidation threshold in basis points
    function getLiquidationLtvBps(address borrowVault) external view returns (uint256) {
        address[] memory collaterals = IEulerVault(borrowVault).LTVList();
        if (collaterals.length == 0) return 0;

        uint256 minLltv = type(uint256).max;
        for (uint256 i = 0; i < collaterals.length; i++) {
            uint16 lltv = IEulerVault(borrowVault).LTVLiquidation(collaterals[i]);
            if (lltv > 0 && lltv < minLltv) {
                minLltv = lltv;
            }
        }

        return minLltv == type(uint256).max ? 0 : minLltv;
    }

    /// @notice Returns the borrow LTV limit in basis points
    /// @dev Returns the minimum borrow LTV across all enabled collaterals
    /// @param borrowVault The vault where the user has debt
    /// @return Minimum borrow LTV in basis points
    function getBorrowLtvBps(address borrowVault) external view returns (uint256) {
        address[] memory collaterals = IEulerVault(borrowVault).LTVList();
        if (collaterals.length == 0) return 0;

        uint256 minLtv = type(uint256).max;
        for (uint256 i = 0; i < collaterals.length; i++) {
            uint16 ltv = IEulerVault(borrowVault).LTVBorrow(collaterals[i]);
            if (ltv > 0 && ltv < minLtv) {
                minLtv = ltv;
            }
        }

        return minLtv == type(uint256).max ? 0 : minLtv;
    }

    // ============ Position Queries ============

    /// @notice Check if a position is healthy (not liquidatable)
    /// @param borrowVault The vault where the user has debt
    /// @param user The user address
    /// @param subAccountIndex The sub-account index
    /// @return True if position is healthy (or no position)
    function isHealthy(
        address borrowVault,
        address user,
        uint8 subAccountIndex
    ) external view returns (bool) {
        address subAccount = getSubAccount(user, subAccountIndex);

        try IEulerVault(borrowVault).accountLiquidity(subAccount, true) returns (
            uint256 collateralValue,
            uint256 liabilityValue
        ) {
            // Position is healthy if collateralValue >= liabilityValue (using liquidation LTV)
            return collateralValue >= liabilityValue;
        } catch {
            // No position (no controller) - considered healthy
            return true;
        }
    }

    /// @notice Get health factor (collateral / liability ratio)
    /// @param borrowVault The vault where the user has debt
    /// @param user The user address
    /// @param subAccountIndex The sub-account index
    /// @return Health factor in 1e18 scale (1e18 = 1.0, max = no debt)
    function getHealthFactor(
        address borrowVault,
        address user,
        uint8 subAccountIndex
    ) external view returns (uint256) {
        address subAccount = getSubAccount(user, subAccountIndex);

        try IEulerVault(borrowVault).accountLiquidity(subAccount, true) returns (
            uint256 collateralValue,
            uint256 liabilityValue
        ) {
            if (liabilityValue == 0) return type(uint256).max;
            return (collateralValue * 1e18) / liabilityValue;
        } catch {
            // No position (no controller) - infinite health factor
            return type(uint256).max;
        }
    }

    /// @notice Get debt balance for a sub-account
    /// @param borrowVault The vault where the user has debt
    /// @param user The user address
    /// @param subAccountIndex The sub-account index
    /// @return Debt in underlying asset units
    function getDebtBalance(
        address borrowVault,
        address user,
        uint8 subAccountIndex
    ) external view returns (uint256) {
        address subAccount = getSubAccount(user, subAccountIndex);
        return IEulerVault(borrowVault).debtOf(subAccount);
    }

    /// @notice Get collateral balance for a sub-account in a specific vault
    /// @param collateralVault The vault where collateral is deposited
    /// @param user The user address
    /// @param subAccountIndex The sub-account index
    /// @return Collateral in underlying asset units
    function getCollateralBalance(
        address collateralVault,
        address user,
        uint8 subAccountIndex
    ) external view returns (uint256) {
        address subAccount = getSubAccount(user, subAccountIndex);
        return IEulerVault(collateralVault).maxWithdraw(subAccount);
    }

    // ============ Vault Info ============

    /// @notice Get vault's underlying asset
    /// @param vault The vault address
    /// @return The underlying asset address
    function getVaultAsset(address vault) external view returns (address) {
        return IEulerVault(vault).asset();
    }

    /// @notice Get vault's name
    /// @param vault The vault address
    /// @return The vault name
    function getVaultName(address vault) external view returns (string memory) {
        return IEulerVault(vault).name();
    }

    /// @notice Get vault's symbol
    /// @param vault The vault address
    /// @return The vault symbol
    function getVaultSymbol(address vault) external view returns (string memory) {
        return IEulerVault(vault).symbol();
    }

    /// @notice Get list of accepted collaterals for a borrow vault
    /// @param borrowVault The borrow vault address
    /// @return Array of collateral vault addresses with configured LTVs
    function getAcceptedCollaterals(address borrowVault) external view returns (address[] memory) {
        return IEulerVault(borrowVault).LTVList();
    }

    /// @notice Get LTV configuration for a specific collateral
    /// @param borrowVault The borrow vault address
    /// @param collateralVault The collateral vault address
    /// @return borrowLTV The borrow LTV in basis points
    /// @return liquidationLTV The liquidation LTV in basis points
    function getCollateralLtv(
        address borrowVault,
        address collateralVault
    ) external view returns (uint256 borrowLTV, uint256 liquidationLTV) {
        borrowLTV = IEulerVault(borrowVault).LTVBorrow(collateralVault);
        liquidationLTV = IEulerVault(borrowVault).LTVLiquidation(collateralVault);
    }

    // ============ Position Value Queries (for ADL/AL) ============

    /// @notice Get total collateral and debt values in USD (8 decimals)
    /// @dev Used by ADL/AL triggers to calculate position values
    /// @param borrowVault The vault where the user has debt
    /// @param user The user address
    /// @param subAccountIndex The sub-account index
    /// @return totalCollateralUsd Total collateral value in 8 decimals USD
    /// @return totalDebtUsd Total debt value in 8 decimals USD
    function getUserAccountData(
        address borrowVault,
        address user,
        uint8 subAccountIndex
    ) external view returns (uint256 totalCollateralUsd, uint256 totalDebtUsd) {
        address subAccount = getSubAccount(user, subAccountIndex);

        // Get raw collateral and liability values from Euler
        // Using liquidation=false to get borrow-adjusted values
        // Note: accountLiquidityFull reverts if sub-account has no controller
        address[] memory collaterals;
        uint256[] memory collateralValues;
        uint256 liabilityValue;

        try IEulerVault(borrowVault).accountLiquidityFull(subAccount, false) returns (
            address[] memory c,
            uint256[] memory cv,
            uint256 lv
        ) {
            collaterals = c;
            collateralValues = cv;
            liabilityValue = lv;
        } catch {
            // No position (no controller set) - return (0, 0)
            return (0, 0);
        }

        // Sum raw collateral values (un-adjust by dividing by borrow LTV)
        uint256 rawCollateralValue = 0;
        for (uint256 i = 0; i < collaterals.length; i++) {
            if (collateralValues[i] > 0) {
                try IEulerVault(borrowVault).LTVBorrow(collaterals[i]) returns (uint16 ltv) {
                    if (ltv > 0) {
                        // rawValue = adjustedValue * 10000 / LTV
                        rawCollateralValue += (collateralValues[i] * 10000) / ltv;
                    }
                } catch {
                    // Skip collateral if LTV lookup fails
                    continue;
                }
            }
        }

        // Get unit of account decimals to convert to 8 decimals (Chainlink format)
        address unitOfAccount;
        try IEulerVault(borrowVault).unitOfAccount() returns (address uoa) {
            unitOfAccount = uoa;
        } catch {
            // Default to 18 decimals if we can't get unit of account
            return (rawCollateralValue / (10 ** 10), liabilityValue / (10 ** 10));
        }
        uint8 uoaDecimals = 18; // Default to 18 if we can't get decimals
        if (unitOfAccount != address(0) && unitOfAccount.code.length > 0) {
            try IERC20Metadata(unitOfAccount).decimals() returns (uint8 d) {
                uoaDecimals = d;
            } catch {}
        }

        // Convert from unit of account decimals to 8 decimals
        if (uoaDecimals > 8) {
            uint256 divisor = 10 ** (uoaDecimals - 8);
            totalCollateralUsd = rawCollateralValue / divisor;
            totalDebtUsd = liabilityValue / divisor;
        } else if (uoaDecimals < 8) {
            uint256 multiplier = 10 ** (8 - uoaDecimals);
            totalCollateralUsd = rawCollateralValue * multiplier;
            totalDebtUsd = liabilityValue * multiplier;
        } else {
            totalCollateralUsd = rawCollateralValue;
            totalDebtUsd = liabilityValue;
        }
    }

    // ============ Price Queries (for ADL) ============

    /// @notice Get exchange rate between two tokens via vault's oracle
    /// @dev Returns how many quote tokens you get for 1 whole unit of base token
    /// @param vault Any vault that has the oracle configured
    /// @param baseToken The token to price (e.g., WETH)
    /// @param quoteToken The unit of account (e.g., USDC)
    /// @return rate Exchange rate scaled by quoteToken decimals
    function getExchangeRate(
        address vault,
        address baseToken,
        address quoteToken
    ) external view returns (uint256 rate) {
        address oracle = IEulerVault(vault).oracle();
        if (oracle == address(0)) return 0;

        // Get 1 whole unit of base token
        uint8 baseDecimals = IERC20Metadata(baseToken).decimals();
        uint256 oneUnit = 10 ** baseDecimals;

        try IEulerPriceOracle(oracle).getQuote(oneUnit, baseToken, quoteToken) returns (uint256 quote) {
            return quote;
        } catch {
            return 0;
        }
    }

    /// @notice Get price of a token in the vault's unit of account
    /// @dev Returns the value of 1 whole unit of token
    /// @param vault The vault to query (determines oracle and unit of account)
    /// @param token The token to price
    /// @return price Price in unit of account decimals
    function getAssetPrice(
        address vault,
        address token
    ) external view returns (uint256 price) {
        address oracle = IEulerVault(vault).oracle();
        address unitOfAccount = IEulerVault(vault).unitOfAccount();
        if (oracle == address(0) || unitOfAccount == address(0)) return 0;

        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        uint256 oneUnit = 10 ** tokenDecimals;

        try IEulerPriceOracle(oracle).getQuote(oneUnit, token, unitOfAccount) returns (uint256 quote) {
            return quote;
        } catch {
            return 0;
        }
    }

    /// @notice Get exchange rate between collateral and debt token for a position
    /// @dev Useful for ADL: how many debt tokens per collateral token
    /// @param borrowVault The borrow vault (debt side)
    /// @param collateralVault The collateral vault
    /// @return rate18 Exchange rate with 18 decimals (collateral → debt)
    function getCollateralToDebtRate(
        address borrowVault,
        address collateralVault
    ) external view returns (uint256 rate18) {
        address oracle = IEulerVault(borrowVault).oracle();
        address unitOfAccount = IEulerVault(borrowVault).unitOfAccount();
        if (oracle == address(0) || unitOfAccount == address(0)) return 0;

        address collateralAsset = IEulerVault(collateralVault).asset();
        address debtAsset = IEulerVault(borrowVault).asset();

        uint8 collateralDecimals = IERC20Metadata(collateralAsset).decimals();
        uint8 debtDecimals = IERC20Metadata(debtAsset).decimals();

        // Get value of 1 collateral in unit of account
        uint256 oneCollateral = 10 ** collateralDecimals;
        uint256 collateralValue;
        try IEulerPriceOracle(oracle).getQuote(oneCollateral, collateralAsset, unitOfAccount) returns (uint256 v) {
            collateralValue = v;
        } catch {
            return 0;
        }

        // Get value of 1 debt token in unit of account
        uint256 oneDebt = 10 ** debtDecimals;
        uint256 debtValue;
        try IEulerPriceOracle(oracle).getQuote(oneDebt, debtAsset, unitOfAccount) returns (uint256 v) {
            debtValue = v;
        } catch {
            return 0;
        }

        if (debtValue == 0) return 0;

        // exchangeRate = collateralValue / debtValue (how many debt tokens per collateral)
        // Scale to 18 decimals
        return (collateralValue * 1e18) / debtValue;
    }
}

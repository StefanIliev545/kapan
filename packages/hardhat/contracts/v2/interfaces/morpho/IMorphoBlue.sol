// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title IMorphoBlue Interface
/// @notice Interface for Morpho Blue lending protocol
/// @dev See https://github.com/morpho-org/morpho-blue

struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    address irm;
    uint256 lltv;
}

struct Market {
    uint128 totalSupplyAssets;
    uint128 totalSupplyShares;
    uint128 totalBorrowAssets;
    uint128 totalBorrowShares;
    uint128 lastUpdate;
    uint128 fee;
}

struct Position {
    uint256 supplyShares;
    uint128 borrowShares;
    uint128 collateral;
}

interface IMorphoBlue {
    /// @notice The state of a market (by id)
    function market(bytes32 id) external view returns (Market memory);

    /// @notice The position of a user in a market
    function position(bytes32 id, address user) external view returns (Position memory);

    /// @notice Whether an address is authorized to act on behalf of another
    function isAuthorized(address authorizer, address authorized) external view returns (bool);

    /// @notice The nonce of an authorizer for EIP-712 signatures
    function nonce(address authorizer) external view returns (uint256);

    /// @notice Compute market ID from market params
    function idToMarketParams(bytes32 id) external view returns (MarketParams memory);

    // ============ Write Functions ============

    /// @notice Supply assets to a market (lender side - earns yield)
    /// @param marketParams The market to supply to
    /// @param assets The amount of assets to supply (use 0 if using shares)
    /// @param shares The amount of shares to mint (use 0 if using assets)
    /// @param onBehalf The address to supply on behalf of
    /// @param data Callback data (empty for no callback)
    /// @return assetsSupplied The actual amount of assets supplied
    /// @return sharesSupplied The actual amount of shares minted
    function supply(
        MarketParams memory marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        bytes memory data
    ) external returns (uint256 assetsSupplied, uint256 sharesSupplied);

    /// @notice Withdraw assets from a market (lender side)
    /// @param marketParams The market to withdraw from
    /// @param assets The amount of assets to withdraw (use 0 if using shares)
    /// @param shares The amount of shares to burn (use 0 if using assets)
    /// @param onBehalf The address to withdraw on behalf of
    /// @param receiver The address to receive the withdrawn assets
    /// @return assetsWithdrawn The actual amount of assets withdrawn
    /// @return sharesWithdrawn The actual amount of shares burned
    function withdraw(
        MarketParams memory marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        address receiver
    ) external returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn);

    /// @notice Borrow assets from a market
    /// @param marketParams The market to borrow from
    /// @param assets The amount of assets to borrow (use 0 if using shares)
    /// @param shares The amount of borrow shares to mint (use 0 if using assets)
    /// @param onBehalf The address to borrow on behalf of
    /// @param receiver The address to receive the borrowed assets
    /// @return assetsBorrowed The actual amount of assets borrowed
    /// @return sharesBorrowed The actual amount of borrow shares minted
    function borrow(
        MarketParams memory marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        address receiver
    ) external returns (uint256 assetsBorrowed, uint256 sharesBorrowed);

    /// @notice Repay borrowed assets
    /// @param marketParams The market to repay to
    /// @param assets The amount of assets to repay (use 0 if using shares)
    /// @param shares The amount of borrow shares to burn (use 0 if using assets)
    /// @param onBehalf The address to repay on behalf of
    /// @param data Callback data (empty for no callback)
    /// @return assetsRepaid The actual amount of assets repaid
    /// @return sharesRepaid The actual amount of borrow shares burned
    function repay(
        MarketParams memory marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        bytes memory data
    ) external returns (uint256 assetsRepaid, uint256 sharesRepaid);

    /// @notice Supply collateral to a market
    /// @param marketParams The market to supply collateral to
    /// @param assets The amount of collateral assets to supply
    /// @param onBehalf The address to supply on behalf of
    /// @param data Callback data (empty for no callback)
    function supplyCollateral(
        MarketParams memory marketParams,
        uint256 assets,
        address onBehalf,
        bytes memory data
    ) external;

    /// @notice Withdraw collateral from a market
    /// @param marketParams The market to withdraw collateral from
    /// @param assets The amount of collateral assets to withdraw
    /// @param onBehalf The address to withdraw on behalf of
    /// @param receiver The address to receive the withdrawn collateral
    function withdrawCollateral(
        MarketParams memory marketParams,
        uint256 assets,
        address onBehalf,
        address receiver
    ) external;

    /// @notice Set authorization for an address to act on behalf of the caller
    /// @param authorized The address to authorize/deauthorize
    /// @param newIsAuthorized Whether to authorize (true) or deauthorize (false)
    function setAuthorization(address authorized, bool newIsAuthorized) external;

    /// @notice Set authorization with signature (EIP-712)
    function setAuthorizationWithSig(
        address authorizer,
        address authorized,
        bool newIsAuthorized,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /// @notice Accrue interest for a market
    function accrueInterest(MarketParams memory marketParams) external;
}

/// @notice Library for computing Morpho Blue market IDs
library MorphoLib {
    /// @notice Compute the market ID from market params
    function id(MarketParams memory params) internal pure returns (bytes32) {
        return keccak256(abi.encode(params));
    }
}


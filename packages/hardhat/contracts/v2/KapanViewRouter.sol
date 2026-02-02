// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { MarketParams } from "./interfaces/morpho/IMorphoBlue.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/**
 * @title Gateway View Interfaces
 * @notice Minimal interfaces for LTV queries on each protocol's gateway view
 */

interface IAaveGatewayView {
    function getCurrentLtvBps(address market, address user) external view returns (uint256);
    function getLiquidationLtvBps(address market, address user) external view returns (uint256);
    function getAssetPrice(address token) external view returns (uint256);
    function getAssetPrices(address[] calldata tokens) external view returns (uint256[] memory);
    function getUserAccountData(
        address user
    )
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        );
}

interface ICompoundGatewayView {
    function getCurrentLtvBps(address token, address user) external view returns (uint256);
    function getLiquidationLtvBps(address token, address user) external view returns (uint256);
    function getPrice(address token) external view returns (uint256);
    function getCollateralPrice(address market, address asset) external view returns (uint256);
    function getPositionValue(
        address market,
        address user
    ) external view returns (uint256 collateralValueUsd, uint256 debtValueUsd);
}

interface IMorphoBlueGatewayView {
    function getCurrentLtvBps(MarketParams calldata params, address user) external view returns (uint256);
    function getLiquidationLtvBps(MarketParams calldata params) external view returns (uint256);
    function getOraclePrice(MarketParams calldata params) external view returns (uint256);
    function getPositionValue(
        MarketParams calldata params,
        address user
    ) external view returns (uint256 collateralValueUsd, uint256 debtValueUsd);
}

interface IEulerGatewayView {
    function getCurrentLtvBps(address vault, address user, uint8 subAccountIndex) external view returns (uint256);
    function getLiquidationLtvBps(address vault) external view returns (uint256);
    function getAssetPrice(address vault, address token) external view returns (uint256);
    function getCollateralToDebtRate(address borrowVault, address collateralVault) external view returns (uint256);
    function getUserAccountData(address borrowVault, address user, uint8 subAccountIndex) external view returns (uint256 totalCollateralUsd, uint256 totalDebtUsd);
}

interface IVenusGatewayView {
    function getCurrentLtvBps(address market, address user) external view returns (uint256);
    function getLiquidationLtvBps(address market, address user) external view returns (uint256);
    function getAssetPrice(address underlyingToken) external view returns (uint256);
    function getAssetPrice8(address underlyingToken) external view returns (uint256);
    function getUserAccountData(address user) external view returns (uint256 totalCollateralUsd, uint256 totalDebtUsd);
}

/**
 * @title KapanViewRouter
 * @notice Unified read-only router for querying position data across lending protocols
 * @dev Aggregates gateway view contracts to provide protocol-agnostic LTV queries for ADL
 *
 * Supported protocols:
 *   - "aave-v3": Aave V3 (context: empty)
 *   - "compound-v3": Compound V3 (context: abi.encode(baseToken address))
 *   - "morpho-blue": Morpho Blue (context: abi.encode(MarketParams))
 *   - "euler-v2": Euler V2 (context: abi.encode(vault address, subAccountIndex uint8))
 *   - "venus": Venus (context: empty)
 */
contract KapanViewRouter {
    // ============ Errors ============

    error UnsupportedProtocol(string protocolName);
    error UnsupportedProtocolId(bytes4 protocolId);
    error GatewayNotSet(string protocolName);
    error ZeroAddress();

    // ============ Events ============

    event GatewayUpdated(string indexed protocolName, address gateway);

    // ============ Constants ============

    /// @notice Protocol identifiers (bytes4 for unified interface)
    bytes4 public constant AAVE_V3 = bytes4(keccak256("aave-v3"));
    bytes4 public constant COMPOUND_V3 = bytes4(keccak256("compound-v3"));
    bytes4 public constant MORPHO_BLUE = bytes4(keccak256("morpho-blue"));
    bytes4 public constant EULER_V2 = bytes4(keccak256("euler-v2"));
    bytes4 public constant VENUS = bytes4(keccak256("venus"));

    // ============ State ============

    /// @notice Owner who can update gateway addresses
    address public owner;

    /// @notice Protocol name => gateway view address (consistent with KapanRouter)
    mapping(string => address) public gateways;

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ============ Constructor ============

    constructor(address _owner) {
        if (_owner == address(0)) revert ZeroAddress();
        owner = _owner;
    }

    // ============ Admin ============

    /// @notice Set or update a gateway view address
    /// @param protocolName Protocol name (e.g., "aave-v3", "morpho-blue")
    /// @param gateway Gateway view contract address
    function setGateway(string calldata protocolName, address gateway) external onlyOwner {
        if (gateway == address(0)) revert ZeroAddress();
        gateways[protocolName] = gateway;
        emit GatewayUpdated(protocolName, gateway);
    }

    /// @notice Batch set multiple gateways
    /// @param protocolNames Array of protocol names
    /// @param gatewayAddresses Array of gateway addresses
    function setGateways(string[] calldata protocolNames, address[] calldata gatewayAddresses) external onlyOwner {
        require(protocolNames.length == gatewayAddresses.length, "Length mismatch");
        for (uint256 i = 0; i < protocolNames.length; i++) {
            if (gatewayAddresses[i] == address(0)) revert ZeroAddress();
            gateways[protocolNames[i]] = gatewayAddresses[i];
            emit GatewayUpdated(protocolNames[i], gatewayAddresses[i]);
        }
    }

    /// @notice Transfer ownership
    /// @param newOwner New owner address
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    // ============ LTV Queries ============

    /// @notice Get current LTV for Aave V3
    /// @param user The user's address
    /// @return ltvBps Current LTV in basis points
    function getAaveLtvBps(address user) external view returns (uint256 ltvBps) {
        address gateway = gateways["aave-v3"];
        if (gateway == address(0)) revert GatewayNotSet("aave-v3");
        return IAaveGatewayView(gateway).getCurrentLtvBps(address(0), user);
    }

    /// @notice Get liquidation LTV for Aave V3
    function getAaveLiquidationLtvBps(address user) external view returns (uint256) {
        address gateway = gateways["aave-v3"];
        if (gateway == address(0)) revert GatewayNotSet("aave-v3");
        return IAaveGatewayView(gateway).getLiquidationLtvBps(address(0), user);
    }

    /// @notice Get current LTV for Compound V3
    /// @param baseToken The base token of the Comet market (e.g., USDC)
    /// @param user The user's address
    function getCompoundLtvBps(address baseToken, address user) external view returns (uint256) {
        address gateway = gateways["compound-v3"];
        if (gateway == address(0)) revert GatewayNotSet("compound-v3");
        return ICompoundGatewayView(gateway).getCurrentLtvBps(baseToken, user);
    }

    /// @notice Get liquidation LTV for Compound V3
    function getCompoundLiquidationLtvBps(address baseToken, address user) external view returns (uint256) {
        address gateway = gateways["compound-v3"];
        if (gateway == address(0)) revert GatewayNotSet("compound-v3");
        return ICompoundGatewayView(gateway).getLiquidationLtvBps(baseToken, user);
    }

    /// @notice Get current LTV for Morpho Blue
    /// @param params The Morpho market parameters
    /// @param user The user's address
    function getMorphoLtvBps(MarketParams calldata params, address user) external view returns (uint256) {
        address gateway = gateways["morpho-blue"];
        if (gateway == address(0)) revert GatewayNotSet("morpho-blue");
        return IMorphoBlueGatewayView(gateway).getCurrentLtvBps(params, user);
    }

    /// @notice Get liquidation LTV for Morpho Blue
    function getMorphoLiquidationLtvBps(MarketParams calldata params) external view returns (uint256) {
        address gateway = gateways["morpho-blue"];
        if (gateway == address(0)) revert GatewayNotSet("morpho-blue");
        return IMorphoBlueGatewayView(gateway).getLiquidationLtvBps(params);
    }

    /// @notice Get current LTV for Euler V2
    /// @param vault The borrow vault address
    /// @param user The user's address
    /// @param subAccountIndex The sub-account index (0-255)
    function getEulerLtvBps(address vault, address user, uint8 subAccountIndex) external view returns (uint256) {
        address gateway = gateways["euler-v2"];
        if (gateway == address(0)) revert GatewayNotSet("euler-v2");
        return IEulerGatewayView(gateway).getCurrentLtvBps(vault, user, subAccountIndex);
    }

    /// @notice Get liquidation LTV for Euler V2
    function getEulerLiquidationLtvBps(address vault) external view returns (uint256) {
        address gateway = gateways["euler-v2"];
        if (gateway == address(0)) revert GatewayNotSet("euler-v2");
        return IEulerGatewayView(gateway).getLiquidationLtvBps(vault);
    }

    /// @notice Get current LTV for Venus
    /// @param user The user's address
    function getVenusLtvBps(address user) external view returns (uint256) {
        address gateway = gateways["venus"];
        if (gateway == address(0)) revert GatewayNotSet("venus");
        return IVenusGatewayView(gateway).getCurrentLtvBps(address(0), user);
    }

    /// @notice Get liquidation LTV for Venus
    function getVenusLiquidationLtvBps(address user) external view returns (uint256) {
        address gateway = gateways["venus"];
        if (gateway == address(0)) revert GatewayNotSet("venus");
        return IVenusGatewayView(gateway).getLiquidationLtvBps(address(0), user);
    }

    // ============ Risk Assessment ============

    /// @notice Check if Aave position is at liquidation risk
    /// @param user The user's address
    /// @param bufferBps Safety buffer in basis points (e.g., 500 = 5%)
    /// @return atRisk True if current LTV + buffer >= liquidation LTV
    function isAaveAtRisk(address user, uint256 bufferBps) external view returns (bool atRisk) {
        uint256 currentLtv = this.getAaveLtvBps(user);
        uint256 liquidationLtv = this.getAaveLiquidationLtvBps(user);
        if (currentLtv == 0 || liquidationLtv == 0) return false;
        return currentLtv + bufferBps >= liquidationLtv;
    }

    /// @notice Check if Compound position is at liquidation risk
    function isCompoundAtRisk(address baseToken, address user, uint256 bufferBps) external view returns (bool) {
        uint256 currentLtv = this.getCompoundLtvBps(baseToken, user);
        uint256 liquidationLtv = this.getCompoundLiquidationLtvBps(baseToken, user);
        if (currentLtv == 0 || liquidationLtv == 0) return false;
        return currentLtv + bufferBps >= liquidationLtv;
    }

    /// @notice Check if Morpho position is at liquidation risk
    function isMorphoAtRisk(
        MarketParams calldata params,
        address user,
        uint256 bufferBps
    ) external view returns (bool) {
        uint256 currentLtv = this.getMorphoLtvBps(params, user);
        uint256 liquidationLtv = this.getMorphoLiquidationLtvBps(params);
        if (currentLtv == 0 || liquidationLtv == 0) return false;
        return currentLtv + bufferBps >= liquidationLtv;
    }

    // ============ Price Queries (for ADL floor pricing) ============
    // All prices normalized to 8 decimals USD

    /// @notice Get asset price via Aave oracle (8 decimals)
    /// @param token The asset address
    /// @return price Price in 8 decimals USD
    function getAavePrice(address token) external view returns (uint256) {
        address gateway = gateways["aave-v3"];
        if (gateway == address(0)) revert GatewayNotSet("aave-v3");
        return IAaveGatewayView(gateway).getAssetPrice(token);
    }

    /// @notice Get multiple asset prices via Aave oracle
    function getAavePrices(address[] calldata tokens) external view returns (uint256[] memory) {
        address gateway = gateways["aave-v3"];
        if (gateway == address(0)) revert GatewayNotSet("aave-v3");
        return IAaveGatewayView(gateway).getAssetPrices(tokens);
    }

    /// @notice Get asset price via Compound (8 decimals)
    /// @param baseToken The Comet base token (e.g., USDC)
    /// @param asset The asset to price (collateral or base token)
    /// @return price Price in 8 decimals USD
    function getCompoundPrice(address baseToken, address asset) external view returns (uint256) {
        address gateway = gateways["compound-v3"];
        if (gateway == address(0)) revert GatewayNotSet("compound-v3");
        // If pricing the base token, use getPrice; otherwise use getCollateralPrice
        if (asset == baseToken) {
            return ICompoundGatewayView(gateway).getPrice(asset);
        }
        return ICompoundGatewayView(gateway).getCollateralPrice(baseToken, asset);
    }

    /// @notice Get Morpho oracle price (36 decimals, collateral/loan ratio)
    /// @dev This is NOT a USD price - it's the exchange rate from collateral to loan token
    /// @param params The Morpho market parameters
    /// @return price Price ratio with 36 decimals
    function getMorphoOraclePrice(MarketParams calldata params) external view returns (uint256) {
        address gateway = gateways["morpho-blue"];
        if (gateway == address(0)) revert GatewayNotSet("morpho-blue");
        return IMorphoBlueGatewayView(gateway).getOraclePrice(params);
    }

    /// @notice Get asset price via Venus oracle (8 decimals normalized)
    /// @param underlyingToken The underlying asset address
    /// @return price Price in 8 decimals USD
    function getVenusPrice(address underlyingToken) external view returns (uint256) {
        address gateway = gateways["venus"];
        if (gateway == address(0)) revert GatewayNotSet("venus");
        return IVenusGatewayView(gateway).getAssetPrice8(underlyingToken);
    }

    /// @notice Get asset price via Euler oracle (in vault's unit of account)
    /// @param vault The Euler vault address (determines oracle)
    /// @param token The token to price
    /// @return price Price in unit of account decimals
    function getEulerPrice(address vault, address token) external view returns (uint256) {
        address gateway = gateways["euler-v2"];
        if (gateway == address(0)) revert GatewayNotSet("euler-v2");
        return IEulerGatewayView(gateway).getAssetPrice(vault, token);
    }

    /// @notice Get exchange rate for Euler position (collateral → debt)
    /// @dev Returns 18-decimal exchange rate ready for calculateMinBuyFromRate()
    /// @param borrowVault The borrow vault (debt side)
    /// @param collateralVault The collateral vault
    /// @return rate18 Exchange rate with 18 decimals
    function getEulerExchangeRate(address borrowVault, address collateralVault) external view returns (uint256) {
        address gateway = gateways["euler-v2"];
        if (gateway == address(0)) revert GatewayNotSet("euler-v2");
        return IEulerGatewayView(gateway).getCollateralToDebtRate(borrowVault, collateralVault);
    }

    // ============ Position Value Queries (for ADL) ============
    // All values in 8 decimals USD

    /// @notice Get Aave user account data (collateral and debt in USD)
    /// @param user The user address
    /// @return totalCollateralBase Total collateral in 8 decimals USD
    /// @return totalDebtBase Total debt in 8 decimals USD
    /// @return availableBorrowsBase Available borrows in 8 decimals USD
    /// @return currentLiquidationThreshold Liquidation threshold in basis points
    /// @return ltv Loan-to-value ratio in basis points
    /// @return healthFactor Health factor (1e18 scale)
    function getAaveUserAccountData(
        address user
    )
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        )
    {
        address gateway = gateways["aave-v3"];
        if (gateway == address(0)) revert GatewayNotSet("aave-v3");
        return IAaveGatewayView(gateway).getUserAccountData(user);
    }

    /// @notice Get Compound position value (collateral and debt in USD)
    /// @param baseToken The Comet base token (e.g., USDC)
    /// @param user The user address
    /// @return collateralValueUsd Total collateral in 8 decimals USD
    /// @return debtValueUsd Total debt in 8 decimals USD
    function getCompoundPositionValue(
        address baseToken,
        address user
    ) external view returns (uint256 collateralValueUsd, uint256 debtValueUsd) {
        address gateway = gateways["compound-v3"];
        if (gateway == address(0)) revert GatewayNotSet("compound-v3");
        return ICompoundGatewayView(gateway).getPositionValue(baseToken, user);
    }

    /// @notice Get Morpho position value (collateral and debt in USD)
    /// @param params The Morpho market parameters
    /// @param user The user address
    /// @return collateralValueUsd Total collateral in 8 decimals USD
    /// @return debtValueUsd Total debt in 8 decimals USD
    function getMorphoPositionValue(
        MarketParams calldata params,
        address user
    ) external view returns (uint256 collateralValueUsd, uint256 debtValueUsd) {
        address gateway = gateways["morpho-blue"];
        if (gateway == address(0)) revert GatewayNotSet("morpho-blue");
        return IMorphoBlueGatewayView(gateway).getPositionValue(params, user);
    }

    /// @notice Get Venus user account data (collateral and debt in USD)
    /// @param user The user address
    /// @return totalCollateralUsd Total collateral in 8 decimals USD
    /// @return totalDebtUsd Total debt in 8 decimals USD
    function getVenusUserAccountData(
        address user
    ) external view returns (uint256 totalCollateralUsd, uint256 totalDebtUsd) {
        address gateway = gateways["venus"];
        if (gateway == address(0)) revert GatewayNotSet("venus");
        return IVenusGatewayView(gateway).getUserAccountData(user);
    }

    // ============ ADL Floor Price Calculation ============

    /// @notice Calculate minimum buy amount using exchange rate
    /// @dev Exchange rate = how many buyTokens per sellToken, scaled by 1e18
    /// @param sellAmount Amount of sellToken (in sellToken decimals)
    /// @param maxSlippageBps Maximum slippage in basis points (e.g., 100 = 1%)
    /// @param exchangeRate18 Exchange rate with 18 decimals (sellToken → buyToken)
    /// @param sellDecimals Decimals of sell token
    /// @param buyDecimals Decimals of buy token
    /// @return minBuyAmount Minimum acceptable buy amount
    function calculateMinBuyFromRate(
        uint256 sellAmount,
        uint256 maxSlippageBps,
        uint256 exchangeRate18,
        uint8 sellDecimals,
        uint8 buyDecimals
    ) external pure returns (uint256 minBuyAmount) {
        if (exchangeRate18 == 0) return 0;

        // buyAmount = sellAmount * exchangeRate / 1e18
        // Then adjust for decimal difference between tokens

        // Step 1: Apply exchange rate (result has sellDecimals precision)
        uint256 rawBuyAmount = (sellAmount * exchangeRate18) / 1e18;

        // Step 2: Adjust for decimal difference
        if (buyDecimals >= sellDecimals) {
            minBuyAmount = rawBuyAmount * (10 ** (buyDecimals - sellDecimals));
        } else {
            minBuyAmount = rawBuyAmount / (10 ** (sellDecimals - buyDecimals));
        }

        // Step 3: Apply slippage tolerance
        minBuyAmount = (minBuyAmount * (10000 - maxSlippageBps)) / 10000;
    }

    /// @notice Convert two USD prices (same decimals) to an 18-decimal exchange rate
    /// @dev exchangeRate18 = sellPriceUsd * 1e18 / buyPriceUsd
    /// @param sellPriceUsd USD price of sell token (any decimals, but same as buyPriceUsd)
    /// @param buyPriceUsd USD price of buy token (any decimals, but same as sellPriceUsd)
    /// @return exchangeRate18 Exchange rate with 18 decimals
    function usdPricesToExchangeRate(
        uint256 sellPriceUsd,
        uint256 buyPriceUsd
    ) external pure returns (uint256 exchangeRate18) {
        if (buyPriceUsd == 0) return 0;
        return (sellPriceUsd * 1e18) / buyPriceUsd;
    }

    /// @notice Calculate minimum buy amount for ADL order with slippage protection
    /// @dev Convenience function that takes USD prices and converts to exchange rate internally
    /// @param sellAmount Amount of sellToken
    /// @param maxSlippageBps Maximum slippage in basis points (e.g., 100 = 1%)
    /// @param sellPriceUsd Price of sellToken (any decimals)
    /// @param buyPriceUsd Price of buyToken (same decimals as sellPriceUsd)
    /// @param sellDecimals Decimals of sell token
    /// @param buyDecimals Decimals of buy token
    /// @return minBuyAmount Minimum acceptable buy amount
    function calculateMinBuyAmount(
        uint256 sellAmount,
        uint256 maxSlippageBps,
        uint256 sellPriceUsd,
        uint256 buyPriceUsd,
        uint8 sellDecimals,
        uint8 buyDecimals
    ) external view returns (uint256 minBuyAmount) {
        if (sellPriceUsd == 0 || buyPriceUsd == 0) return 0;

        // Convert USD prices to exchange rate
        uint256 exchangeRate18 = (sellPriceUsd * 1e18) / buyPriceUsd;

        // Use the exchange rate calculation
        return this.calculateMinBuyFromRate(sellAmount, maxSlippageBps, exchangeRate18, sellDecimals, buyDecimals);
    }

    /// @notice Calculate minimum buy amount for Morpho ADL orders
    /// @dev Morpho oracles return the exchange rate scaled by 1e36
    ///      Formula: loanAmount = collateralAmount * price / 1e36
    ///      The oracle price already accounts for token decimals
    /// @param sellAmount Amount of collateral to sell (in collateral token decimals)
    /// @param maxSlippageBps Maximum slippage in basis points
    /// @param morphoOraclePrice Price from Morpho oracle (36 decimals scale)
    /// @return minBuyAmount Minimum acceptable loan tokens to receive
    function calculateMorphoMinBuyAmount(
        uint256 sellAmount,
        uint256 maxSlippageBps,
        uint256 morphoOraclePrice
    ) external pure returns (uint256 minBuyAmount) {
        if (morphoOraclePrice == 0) return 0;

        // Morpho oracle: loanAmount = collateralAmount * price / ORACLE_PRICE_SCALE
        // The oracle price already incorporates the decimal difference between tokens
        // ORACLE_PRICE_SCALE = 1e36

        minBuyAmount = (sellAmount * morphoOraclePrice) / 1e36;

        // Apply slippage tolerance
        minBuyAmount = (minBuyAmount * (10000 - maxSlippageBps)) / 10000;
    }

    // ============ Unified Interface (Protocol-Agnostic) ============
    // These functions allow callers to interact with any protocol using a bytes4 protocolId
    // and protocol-specific context data, without needing to know protocol internals.

    /// @notice Get the protocol name for a protocol ID
    /// @param protocolId The bytes4 protocol identifier
    /// @return protocolName The string protocol name for gateway lookup
    function _getProtocolName(bytes4 protocolId) internal pure returns (string memory protocolName) {
        if (protocolId == AAVE_V3) return "aave-v3";
        if (protocolId == COMPOUND_V3) return "compound-v3";
        if (protocolId == MORPHO_BLUE) return "morpho-blue";
        if (protocolId == EULER_V2) return "euler-v2";
        if (protocolId == VENUS) return "venus";
        revert UnsupportedProtocolId(protocolId);
    }

    /// @notice Get current LTV for any protocol (unified interface)
    /// @param protocolId Protocol identifier (AAVE_V3, COMPOUND_V3, etc.)
    /// @param user User address
    /// @param context Protocol-specific context:
    ///   - AAVE_V3: empty bytes
    ///   - COMPOUND_V3: abi.encode(baseToken address)
    ///   - MORPHO_BLUE: abi.encode(MarketParams)
    ///   - EULER_V2: abi.encode(vault address, subAccountIndex uint8)
    ///   - VENUS: empty bytes
    /// @return ltvBps Current LTV in basis points
    function getCurrentLtv(
        bytes4 protocolId,
        address user,
        bytes calldata context
    ) external view returns (uint256 ltvBps) {
        string memory protocolName = _getProtocolName(protocolId);
        address gateway = gateways[protocolName];
        if (gateway == address(0)) revert GatewayNotSet(protocolName);

        if (protocolId == AAVE_V3) {
            return IAaveGatewayView(gateway).getCurrentLtvBps(address(0), user);
        }
        if (protocolId == COMPOUND_V3) {
            address baseToken = abi.decode(context, (address));
            return ICompoundGatewayView(gateway).getCurrentLtvBps(baseToken, user);
        }
        if (protocolId == MORPHO_BLUE) {
            MarketParams memory params = abi.decode(context, (MarketParams));
            return IMorphoBlueGatewayView(gateway).getCurrentLtvBps(params, user);
        }
        if (protocolId == EULER_V2) {
            (address vault, uint8 subAccountIndex) = abi.decode(context, (address, uint8));
            return IEulerGatewayView(gateway).getCurrentLtvBps(vault, user, subAccountIndex);
        }
        if (protocolId == VENUS) {
            return IVenusGatewayView(gateway).getCurrentLtvBps(address(0), user);
        }

        revert UnsupportedProtocolId(protocolId);
    }

    /// @notice Get position value for any protocol (unified interface)
    /// @param protocolId Protocol identifier
    /// @param user User address
    /// @param context Protocol-specific context (see getCurrentLtv)
    /// @return collateralValueUsd Total collateral in 8 decimals USD
    /// @return debtValueUsd Total debt in 8 decimals USD
    function getPositionValue(
        bytes4 protocolId,
        address user,
        bytes calldata context
    ) external view returns (uint256 collateralValueUsd, uint256 debtValueUsd) {
        string memory protocolName = _getProtocolName(protocolId);
        address gateway = gateways[protocolName];
        if (gateway == address(0)) revert GatewayNotSet(protocolName);

        if (protocolId == AAVE_V3) {
            (uint256 totalCollateral, uint256 totalDebt, , , , ) = IAaveGatewayView(gateway).getUserAccountData(user);
            return (totalCollateral, totalDebt);
        }
        if (protocolId == COMPOUND_V3) {
            address baseToken = abi.decode(context, (address));
            return ICompoundGatewayView(gateway).getPositionValue(baseToken, user);
        }
        if (protocolId == MORPHO_BLUE) {
            MarketParams memory params = abi.decode(context, (MarketParams));
            return IMorphoBlueGatewayView(gateway).getPositionValue(params, user);
        }
        if (protocolId == VENUS) {
            return IVenusGatewayView(gateway).getUserAccountData(user);
        }
        if (protocolId == EULER_V2) {
            (address vault, uint8 subAccountIndex) = abi.decode(context, (address, uint8));
            return IEulerGatewayView(gateway).getUserAccountData(vault, user, subAccountIndex);
        }

        revert UnsupportedProtocolId(protocolId);
    }

    /// @notice Get collateral price for any protocol (unified interface)
    /// @param protocolId Protocol identifier
    /// @param collateralToken Collateral token address
    /// @param context Protocol-specific context (see getCurrentLtv)
    /// @return price Price in 8 decimals USD (or 1e8 for protocols using exchange rates)
    function getCollateralPrice(
        bytes4 protocolId,
        address collateralToken,
        bytes calldata context
    ) external view returns (uint256 price) {
        string memory protocolName = _getProtocolName(protocolId);
        address gateway = gateways[protocolName];
        if (gateway == address(0)) revert GatewayNotSet(protocolName);

        if (protocolId == AAVE_V3) {
            return IAaveGatewayView(gateway).getAssetPrice(collateralToken);
        }
        if (protocolId == COMPOUND_V3) {
            address baseToken = abi.decode(context, (address));
            if (collateralToken == baseToken) {
                return ICompoundGatewayView(gateway).getPrice(collateralToken);
            }
            return ICompoundGatewayView(gateway).getCollateralPrice(baseToken, collateralToken);
        }
        if (protocolId == VENUS) {
            return IVenusGatewayView(gateway).getAssetPrice8(collateralToken);
        }
        if (protocolId == MORPHO_BLUE) {
            // For Morpho, derive collateral price from the oracle
            // Oracle returns collateral/loan exchange rate scaled by 10^(36 + loanDecimals - collateralDecimals)
            // We want price in 8 decimals, so divide by 10^(36 + loanDecimals - collateralDecimals - 8)
            // = 10^(28 + loanDecimals - collateralDecimals)
            MarketParams memory params = abi.decode(context, (MarketParams));
            uint256 oraclePrice = IMorphoBlueGatewayView(gateway).getOraclePrice(params);
            if (oraclePrice > 0) {
                uint8 loanDecimals = _getDecimals(params.loanToken);
                uint8 collateralDecimals = _getDecimals(params.collateralToken);
                // exponent = 28 + loanDecimals - collateralDecimals
                // Examples:
                //   WBTC(8)/USDC(6):  28 + 6 - 8  = 26
                //   ETH(18)/USDC(6):  28 + 6 - 18 = 16
                //   USDC(6)/ETH(18):  28 + 18 - 6 = 40
                //   USDC(6)/USDT(6):  28 + 6 - 6  = 28
                int16 exponent = 28 + int16(uint16(loanDecimals)) - int16(uint16(collateralDecimals));
                if (exponent >= 0) {
                    return oraclePrice / (10 ** uint16(exponent));
                } else {
                    // Negative exponent means multiply instead of divide
                    // This would only happen if collateralDecimals > 28 + loanDecimals
                    // (e.g., a token with 35+ decimals, which doesn't exist in practice)
                    return oraclePrice * (10 ** uint16(-exponent));
                }
            }
        }
        // Euler and fallback: return placeholder (caller should handle)
        return 1e8;
    }

    /// @notice Get debt price for any protocol (unified interface)
    /// @param protocolId Protocol identifier
    /// @param debtToken Debt token address
    /// @param context Protocol-specific context (see getCurrentLtv)
    /// @return price Price in 8 decimals USD (or 1e8 for protocols using exchange rates)
    function getDebtPrice(
        bytes4 protocolId,
        address debtToken,
        bytes calldata context
    ) external view returns (uint256 price) {
        string memory protocolName = _getProtocolName(protocolId);
        address gateway = gateways[protocolName];
        if (gateway == address(0)) revert GatewayNotSet(protocolName);

        if (protocolId == AAVE_V3) {
            return IAaveGatewayView(gateway).getAssetPrice(debtToken);
        }
        if (protocolId == COMPOUND_V3) {
            address baseToken = abi.decode(context, (address));
            if (debtToken == baseToken) {
                return ICompoundGatewayView(gateway).getPrice(debtToken);
            }
            return ICompoundGatewayView(gateway).getCollateralPrice(baseToken, debtToken);
        }
        if (protocolId == VENUS) {
            return IVenusGatewayView(gateway).getAssetPrice8(debtToken);
        }
        if (protocolId == MORPHO_BLUE) {
            // For Morpho, the loan token is the unit of account, so its price is 1.0
            // This is consistent with how getPositionValue calculates debt in "loan token terms"
            return 1e8;
        }
        // Euler and fallback: return placeholder (caller should handle)
        return 1e8;
    }

    /// @notice Calculate minimum buy amount with slippage for any protocol (unified interface)
    /// @param protocolId Protocol identifier
    /// @param sellAmount Amount to sell
    /// @param maxSlippageBps Maximum slippage in basis points
    /// @param collateralToken Collateral token
    /// @param debtToken Debt token
    /// @param collateralDecimals Collateral token decimals
    /// @param debtDecimals Debt token decimals
    /// @param context Protocol-specific context (see getCurrentLtv)
    /// @return minBuyAmount Minimum acceptable buy amount
    function calculateMinBuy(
        bytes4 protocolId,
        uint256 sellAmount,
        uint256 maxSlippageBps,
        address collateralToken,
        address debtToken,
        uint8 collateralDecimals,
        uint8 debtDecimals,
        bytes calldata context
    ) external view returns (uint256 minBuyAmount) {
        string memory protocolName = _getProtocolName(protocolId);
        address gateway = gateways[protocolName];
        if (gateway == address(0)) revert GatewayNotSet(protocolName);

        if (protocolId == MORPHO_BLUE) {
            // For Morpho, use the Morpho oracle which gives collateral/loan exchange rate
            // This is consistent with how getPositionValue and getCollateralPrice work
            MarketParams memory params = abi.decode(context, (MarketParams));
            uint256 morphoPrice = IMorphoBlueGatewayView(gateway).getOraclePrice(params);
            return _calculateMorphoMinBuy(sellAmount, maxSlippageBps, morphoPrice);
        }

        if (protocolId == EULER_V2) {
            // Euler uses 18-decimal exchange rate
            (address borrowVault, ) = abi.decode(context, (address, uint8));
            uint256 eulerExchangeRate = IEulerGatewayView(gateway).getCollateralToDebtRate(
                borrowVault,
                collateralToken
            );
            return
                _calculateMinBuyFromRate(
                    sellAmount,
                    maxSlippageBps,
                    eulerExchangeRate,
                    collateralDecimals,
                    debtDecimals
                );
        }

        // For Aave, Compound, Venus - use USD prices
        uint256 collateralPrice = this.getCollateralPrice(protocolId, collateralToken, context);
        uint256 debtPrice = this.getDebtPrice(protocolId, debtToken, context);

        if (collateralPrice == 0 || debtPrice == 0) {
            return 0;
        }

        uint256 exchangeRate18 = (collateralPrice * 1e18) / debtPrice;
        return _calculateMinBuyFromRate(sellAmount, maxSlippageBps, exchangeRate18, collateralDecimals, debtDecimals);
    }

    /// @dev Internal helper for calculating min buy from exchange rate
    function _calculateMinBuyFromRate(
        uint256 sellAmount,
        uint256 maxSlippageBps,
        uint256 exchangeRate18,
        uint8 sellDecimals,
        uint8 buyDecimals
    ) internal pure returns (uint256 minBuyAmount) {
        if (exchangeRate18 == 0) return 0;

        // buyAmount = sellAmount * exchangeRate / 1e18
        uint256 rawBuyAmount = (sellAmount * exchangeRate18) / 1e18;

        // Adjust for decimal difference
        if (buyDecimals >= sellDecimals) {
            minBuyAmount = rawBuyAmount * (10 ** (buyDecimals - sellDecimals));
        } else {
            minBuyAmount = rawBuyAmount / (10 ** (sellDecimals - buyDecimals));
        }

        // Apply slippage tolerance
        minBuyAmount = (minBuyAmount * (10000 - maxSlippageBps)) / 10000;
    }

    /// @dev Internal helper for calculating min buy from Morpho oracle price
    function _calculateMorphoMinBuy(
        uint256 sellAmount,
        uint256 maxSlippageBps,
        uint256 morphoOraclePrice
    ) internal pure returns (uint256 minBuyAmount) {
        if (morphoOraclePrice == 0) return 0;

        // Morpho oracle: loanAmount = collateralAmount * price / 1e36
        minBuyAmount = (sellAmount * morphoOraclePrice) / 1e36;

        // Apply slippage tolerance
        minBuyAmount = (minBuyAmount * (10000 - maxSlippageBps)) / 10000;
    }

    /// @dev Get token decimals with fallback to 18
    function _getDecimals(address token) internal view returns (uint8) {
        try IERC20Metadata(token).decimals() returns (uint8 d) {
            return d;
        } catch {
            return 18;
        }
    }
}

# Automatic Deleveraging (ADL) System Design

## Overview

ADL automatically reduces leverage when a user's position approaches liquidation. Instead of getting liquidated with penalties, users can set up conditional orders that trigger deleveraging when their LTV crosses a threshold.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Position                                │
│  Collateral: 10 ETH ($30,000)  |  Debt: 20,000 USDC  |  LTV: 66.7%  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      KapanADLHandler                                 │
│  - Registers ADL orders with trigger conditions                      │
│  - Implements IConditionalOrderGenerator (like KapanOrderHandler)    │
│  - Returns orders only when LTV threshold is breached                │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      KapanViewRouter                                 │
│  - Protocol-agnostic position reader                                 │
│  - Calculates current LTV across Aave, Compound, Morpho, etc.        │
│  - Called by KapanADLHandler.getTradeableOrder()                     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      CoW Protocol                                    │
│  - Solvers poll getTradeableOrder() periodically                     │
│  - When LTV > threshold, order becomes valid                         │
│  - Solver executes: sell collateral → buy debt → repay               │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Contracts

### 1. KapanViewRouter

A read-only contract that provides unified position data across lending protocols.

```solidity
interface IKapanViewRouter {
    struct PositionData {
        uint256 totalCollateralUsd;   // 8 decimals
        uint256 totalDebtUsd;         // 8 decimals
        uint256 currentLtv;           // basis points (e.g., 6667 = 66.67%)
        uint256 liquidationLtv;       // protocol's liquidation threshold
        address[] collateralTokens;
        address[] debtTokens;
        uint256[] collateralAmounts;
        uint256[] debtAmounts;
    }

    /// @notice Get unified position data for a user on a protocol
    /// @param protocol Protocol identifier (e.g., "aave-v3", "morpho-blue")
    /// @param user The user's address
    /// @param context Protocol-specific context (e.g., Morpho market params)
    function getPosition(
        string calldata protocol,
        address user,
        bytes calldata context
    ) external view returns (PositionData memory);

    /// @notice Get current LTV in basis points
    function getCurrentLtv(
        string calldata protocol,
        address user,
        bytes calldata context
    ) external view returns (uint256 ltvBps);
}
```

**Why LTV instead of Health Factor?**
- Health Factor is protocol-specific (Aave uses it, Compound doesn't)
- LTV is universal: `debt / collateral` works everywhere
- Easier for users to understand: "deleverage when LTV > 80%"

### 2. KapanADLHandler

Manages ADL orders using CoW Protocol's conditional order system.

```solidity
interface IKapanADLHandler {
    struct ADLOrder {
        // Position identification
        string protocol;              // e.g., "aave-v3"
        bytes protocolContext;        // Morpho market params, etc.

        // Trigger condition
        uint256 triggerLtvBps;        // e.g., 8000 = 80%

        // Deleverage parameters
        address collateralToken;      // Token to sell
        address debtToken;            // Token to buy and repay
        uint256 targetLtvBps;         // Target LTV after deleverage (e.g., 6000 = 60%)
        uint256 maxSlippageBps;       // Max acceptable slippage

        // Execution config
        bool useChunks;               // Split into multiple smaller orders
        uint256 chunkCount;           // Number of chunks if useChunks
    }

    /// @notice Register an ADL order
    function registerADLOrder(ADLOrder calldata order) external returns (bytes32 orderHash);

    /// @notice Cancel an ADL order
    function cancelADLOrder(bytes32 orderHash) external;

    /// @notice Called by CoW solvers - returns order if trigger condition met
    function getTradeableOrder(
        address owner,
        bytes32 orderHash,
        bytes calldata staticInput,
        bytes calldata
    ) external view returns (GPv2Order.Data memory order, bytes memory signature);
}
```

## Order Pricing

### Oracle-Based Floor Price

ADL orders use on-chain oracle prices to set a minimum acceptable exchange rate:

```solidity
function _calculateMinBuyAmount(
    address collateralToken,
    address debtToken,
    uint256 sellAmount,
    uint256 maxSlippageBps
) internal view returns (uint256) {
    // Get oracle prices (Chainlink, protocol oracles, etc.)
    uint256 collateralPrice = _getPrice(collateralToken);  // 8 decimals
    uint256 debtPrice = _getPrice(debtToken);              // 8 decimals

    // Calculate fair value
    uint256 collateralValue = sellAmount * collateralPrice / 10**collateralDecimals;
    uint256 fairBuyAmount = collateralValue * 10**debtDecimals / debtPrice;

    // Apply slippage tolerance
    return fairBuyAmount * (10000 - maxSlippageBps) / 10000;
}
```

### How CoW Solvers Compete

1. ADL order specifies: "Sell 1 ETH, min buy 2,970 USDC" (1% slippage from $3,000)
2. Multiple solvers see this order and compete:
   - Solver A: "I can give 2,985 USDC" (better than minimum)
   - Solver B: "I can give 2,990 USDC" (even better)
3. CoW auction selects the best solver
4. User gets price improvement (surplus) beyond their minimum

**Key insight**: The oracle price sets a floor, but competition pushes execution above it.

## Deleverage Amount Calculation

When LTV exceeds trigger, calculate how much collateral to sell:

```solidity
function _calculateDeleverageAmount(
    uint256 currentCollateralUsd,
    uint256 currentDebtUsd,
    uint256 targetLtvBps
) internal pure returns (uint256 collateralToSellUsd) {
    // Current state: debt/collateral = currentLtv
    // Target state: debt'/collateral' = targetLtv
    // Where: debt' = debt - X, collateral' = collateral - X
    // (assuming 1:1 swap for simplicity)

    // Solve: (debt - X) / (collateral - X) = targetLtv
    // X = (debt - targetLtv * collateral) / (1 - targetLtv)

    uint256 targetLtvScaled = targetLtvBps * 1e14;  // Convert to 18 decimals
    uint256 numerator = currentDebtUsd * 1e18 - targetLtvScaled * currentCollateralUsd;
    uint256 denominator = 1e18 - targetLtvScaled;

    return numerator / denominator;
}
```

**Example:**
- Collateral: $30,000, Debt: $24,000, Current LTV: 80%
- Target LTV: 60%
- Deleverage amount: ($24,000 - 0.6 × $30,000) / (1 - 0.6) = $15,000
- After: Collateral: $15,000, Debt: $9,000, LTV: 60%

## Execution Flow

```
1. User registers ADL order:
   - Trigger: LTV > 80%
   - Target: LTV = 60%
   - Collateral: WETH
   - Debt: USDC

2. CoW solvers poll getTradeableOrder() every ~30 seconds

3. When ETH price drops and LTV crosses 80%:

   getTradeableOrder() is called:
   ├── Call KapanViewRouter.getCurrentLtv()
   ├── If LTV <= triggerLtvBps: return empty (PollTryAtBlock)
   └── If LTV > triggerLtvBps:
       ├── Calculate deleverage amount
       ├── Build GPv2Order with:
       │   - sellToken: WETH
       │   - buyToken: USDC
       │   - sellAmount: calculated amount
       │   - buyAmount: oracle floor with slippage
       │   - receiver: KapanADLHandler (for post-hook)
       └── Return valid order

4. Solver executes the swap

5. Post-hook (KapanOrderHandler style):
   ├── Receive USDC from swap
   ├── Approve protocol gateway
   ├── Call Repay(USDC, swapOutput)
   └── Withdraw WETH to repay flash loan (if used)

6. User's position is now at target LTV
```

## Chunked Execution

For large positions, split deleverage into chunks to reduce price impact:

```solidity
struct ChunkedADL {
    uint256 totalAmount;
    uint256 chunkSize;
    uint256 executedChunks;
    uint256 totalChunks;
    uint256 chunkInterval;      // Minimum time between chunks
    uint256 lastExecutionTime;
}
```

**Benefits:**
- Reduces market impact for large orders
- Allows price to recover between chunks
- TWAP-like execution without external oracle

## Integration with Existing System

ADL reuses existing infrastructure:

| Component | Existing | ADL Usage |
|-----------|----------|-----------|
| Order execution | KapanOrderHandler | KapanADLHandler (similar pattern) |
| Protocol interactions | Gateway contracts | Same gateways for Repay/Withdraw |
| Flash loans | KapanRouter | Optional for atomic execution |
| CoW integration | KapanCowAdapter | Same ERC-1271 verification |

## Order Types Comparison

| Type | Trigger | Pricing | Use Case |
|------|---------|---------|----------|
| **Limit Order** | None (always valid) | User-specified rate | "Swap when price is good" |
| **TWAP** | Time-based chunks | Market rate per chunk | Large swaps with low impact |
| **Stop Loss** | Price threshold | Market rate | "Exit if price drops to X" |
| **ADL** | LTV threshold | Oracle floor + competition | Prevent liquidation |

## Security Considerations

1. **Oracle Manipulation**: Use time-weighted prices or multiple oracle sources
2. **Front-running**: CoW Protocol's batch auction provides MEV protection
3. **Griefing**: Minimum order sizes prevent spam
4. **Reentrancy**: Follow checks-effects-interactions in post-hooks
5. **Authorization**: Only order owner can cancel; handler verifies ownership

## Open Questions

1. **Multi-collateral positions**: How to prioritize which collateral to sell?
   - Option A: User specifies priority list
   - Option B: Sell highest-value collateral first
   - Option C: Proportional sell across all collaterals

2. **Flash loan vs chunks**: When to use each?
   - Flash loan: Immediate, atomic, higher gas
   - Chunks: Gradual, lower impact, requires multiple triggers

3. **Cross-protocol ADL**: Deleverage Aave position to open Morpho position?
   - Could combine ADL with position migration

4. **Fee structure**: Flat fee or percentage of deleverage amount?

## Implemented: Unified LTV Functions

All gateway view contracts now expose consistent LTV functions:

| Protocol | Contract | Function |
|----------|----------|----------|
| Aave | `AaveGatewayViewBase.sol` | `getCurrentLtvBps(address, address user)` |
| Compound | `CompoundGatewayView.sol` | `getCurrentLtvBps(address token, address user)` |
| Venus | `VenusGatewayView.sol` | `getCurrentLtvBps(address, address user)` |
| Morpho | `MorphoBlueGatewayView.sol` | `getCurrentLtvBps(MarketParams, address user)` |
| Euler | `EulerGatewayView.sol` | `getCurrentLtvBps(address vault, address user, uint8 subAccountIndex)` |

All return **basis points** (e.g., 6500 = 65% LTV).

### Liquidation Thresholds

Each contract also provides `getLiquidationLtvBps()` to get the threshold at which liquidation can occur.

### Oracle Integration (Already Available)

Each protocol has oracle integration built-in:
- **Aave**: Uses pool's oracle via `getUserAccountData()`
- **Compound**: Uses comet's price feeds via `getPrice(priceFeed)`
- **Venus**: Uses `oracle.getUnderlyingPrice(vToken)`
- **Morpho**: Uses per-market external oracles (36 decimals)
- **Euler**: Built into `accountLiquidity()` calculation

For ADL order pricing, we can query these same oracles to set floor prices.

## Next Steps

1. [x] ~~Implement unified `getCurrentLtvBps()` across all gateway views~~
2. [x] ~~Create `EulerGatewayView.sol`~~
3. [x] ~~Implement KapanViewRouter (aggregates gateway views)~~
4. [x] ~~Add oracle price query functions for order floor pricing~~ (uses protocol-native oracles)
5. [x] ~~Implement KapanConditionalOrderManager~~ (replaces KapanADLHandler pattern)
6. [x] ~~Write fork tests for ADL execution~~ (`ADLIntegration.fork.ts`, `LtvTrigger.fork.ts`)
7. [ ] Frontend: ADL order creation UI
8. [ ] Frontend: Position monitoring with ADL status

## Implemented: Oracle Price Integration

### The Problem: Oracle Mappings

A naive approach to ADL pricing would require maintaining oracle mappings for every possible token:

```solidity
// BAD: Requires constant maintenance
mapping(address => address) public tokenToChainlinkFeed;

function setOracle(address token, address feed) external onlyOwner {
    tokenToChainlinkFeed[token] = feed;
}
```

This creates issues:
- New tokens require admin transactions to add oracle feeds
- Risk of stale/incorrect mappings
- Different networks have different Chainlink deployments
- Some tokens have no Chainlink feed

### The Solution: Reuse Protocol Oracles

**Key insight**: Lending protocols already maintain trusted oracle infrastructure for liquidations. If a protocol accepts a token as collateral, it MUST have a working oracle for it. We simply query the same oracle the protocol uses.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        KapanViewRouter                               │
│                                                                      │
│  getAavePrice(WETH)  ──────►  AaveGatewayView                       │
│                                    │                                 │
│                                    ▼                                 │
│                              IAaveOracle                             │
│                         (from PoolAddressesProvider)                 │
│                                    │                                 │
│                                    ▼                                 │
│                          Chainlink/internal feeds                    │
│                                    │                                 │
│                                    ▼                                 │
│                       Returns: 302891000000 (8 decimals)             │
│                       = $3,028.91 per WETH                           │
└─────────────────────────────────────────────────────────────────────┘
```

### How Each Protocol's Oracle Is Accessed

#### Aave V3

Aave provides `IAaveOracle` via the PoolAddressesProvider:

```solidity
// In AaveGatewayView.sol
function getAssetPrice(address token) external view returns (uint256 price) {
    // Get oracle from the same source used for liquidations
    IAaveOracle oracle = IAaveOracle(poolAddressesProvider.getPriceOracle());

    // Query price (returns 8 decimals USD)
    return oracle.getAssetPrice(token);
}
```

- **Decimals**: 8 (e.g., WETH = 302891000000 = $3,028.91)
- **Supports**: Any token listed on Aave
- **No config needed**: Oracle address comes from PoolAddressesProvider

#### Compound V3

Compound's Comet contract exposes price feeds:

```solidity
// In CompoundGatewayView.sol
function getPrice(address asset) external view returns (uint256) {
    // Get the priceFeed for this asset from Comet
    address priceFeed = comet.getAssetInfoByAddress(asset).priceFeed;
    return comet.getPrice(priceFeed);
}

function getCollateralPrice(address baseToken, address collateralAsset) external view returns (uint256) {
    IComet comet = comets[baseToken];
    AssetInfo memory info = comet.getAssetInfoByAddress(collateralAsset);
    return comet.getPrice(info.priceFeed);
}
```

- **Decimals**: 8 (normalized by Comet)
- **Supports**: Base token + all registered collaterals
- **Auto-discovery**: Asset info contains the priceFeed address

#### Morpho Blue

Morpho uses per-market oracles specified in MarketParams:

```solidity
// In MorphoBlueGatewayView.sol
function getOraclePrice(MarketParams calldata params) external view returns (uint256) {
    // Each Morpho market defines its own oracle
    return IOracle(params.oracle).price();
}
```

- **Decimals**: 36 (collateral/loan exchange rate, NOT USD price)
- **Note**: This is the ratio of collateral to loan token, adjusted for decimals
- **Market-specific**: Different markets can use different oracle types

#### Venus

Venus uses a resilient oracle via the Comptroller:

```solidity
// In VenusGatewayView.sol
function getAssetPrice(address underlyingToken) external view returns (uint256 price) {
    // Find the vToken for this underlying
    address vTokenAddress = getVTokenForUnderlying(underlyingToken);

    // Query Venus oracle (returns 18 decimals)
    return oracle.getUnderlyingPrice(vTokenAddress);
}

function getAssetPrice8(address underlyingToken) external view returns (uint256 price) {
    // Same as above but normalized to 8 decimals
    address vTokenAddress = getVTokenForUnderlying(underlyingToken);
    return oracle.getUnderlyingPrice(vTokenAddress) / 1e10;
}
```

- **Decimals**: 18 native, 8 via `getAssetPrice8()`
- **Supports**: All underlying tokens with vToken markets

### KapanViewRouter Price Functions

The router provides a unified interface to all protocol oracles:

```solidity
// Query prices through the appropriate gateway
function getAavePrice(address token) external view returns (uint256);
function getAavePrices(address[] calldata tokens) external view returns (uint256[] memory);
function getCompoundPrice(address baseToken, address asset) external view returns (uint256);
function getMorphoOraclePrice(MarketParams calldata params) external view returns (uint256);
function getVenusPrice(address underlyingToken) external view returns (uint256);
```

| Protocol | Router Function | Decimals | Notes |
|----------|-----------------|----------|-------|
| Aave | `getAavePrice(token)` | 8 | USD price |
| Aave | `getAavePrices(tokens[])` | 8 | Batch query |
| Compound | `getCompoundPrice(base, asset)` | 8 | USD price |
| Morpho | `getMorphoOraclePrice(params)` | 36 | Exchange rate |
| Venus | `getVenusPrice(token)` | 8 | USD price (normalized) |

### ADL Floor Price Calculation

The router provides `calculateMinBuyAmount()` to compute the minimum acceptable output for an ADL swap:

```solidity
function calculateMinBuyAmount(
    uint256 sellAmount,      // Amount of collateral to sell
    uint256 maxSlippageBps,  // e.g., 100 = 1%
    uint256 sellPrice,       // From protocol oracle (8 decimals)
    uint256 buyPrice,        // From protocol oracle (8 decimals)
    uint8 sellDecimals,      // Token decimals (e.g., 18 for WETH)
    uint8 buyDecimals        // Token decimals (e.g., 6 for USDC)
) external pure returns (uint256 minBuyAmount);
```

**Calculation steps:**

1. **Compute fair value**: `sellAmount × sellPrice / buyPrice`
2. **Adjust for decimals**: Scale result to buyToken decimals
3. **Apply slippage**: `fairValue × (10000 - slippageBps) / 10000`

**Example: Sell 1 WETH for USDC**

```
Inputs:
  sellAmount = 1e18          (1 WETH, 18 decimals)
  maxSlippageBps = 100       (1% slippage tolerance)
  sellPrice = 302891000000   (WETH = $3,028.91, 8 decimals)
  buyPrice = 99970000        (USDC = $0.9997, 8 decimals)
  sellDecimals = 18          (WETH)
  buyDecimals = 6            (USDC)

Calculation:
  1. sellValue = 1e18 × 302891000000 = 3.02891e29
  2. Scale: since buyDecimals(6) < sellDecimals(18):
     fairBuy = 3.02891e29 / (99970000 × 1e12) = 3030.00 USDC
  3. Apply slippage: 3030.00 × 9900 / 10000 = 2999.70 USDC

Result: minBuyAmount = 2,999,700,000 (2999.70 USDC, 6 decimals)
```

This means: "Sell 1 WETH, receive at least 2,999.70 USDC (oracle fair value minus 1% slippage)"

### Why This Approach Works

1. **Zero configuration**: No oracle mappings to maintain per token
2. **Trust alignment**: Uses the same oracle the protocol trusts for liquidations
3. **Automatic updates**: New tokens listed on protocols are automatically supported
4. **Multi-chain**: Each chain deployment has its own protocol oracles
5. **MEV protection**: CoW Protocol auction + oracle floor prevents sandwich attacks

### Complete ADL Pricing Flow

```
User creates ADL order:
├── Protocol: Aave V3
├── Collateral: WETH
├── Debt: USDC
├── Trigger: LTV > 80%
├── Target: LTV = 60%
├── Max Slippage: 1%

When LTV crosses 80%, getTradeableOrder():
│
├── 1. Query current position
│      router.getAaveLtvBps(user) → 8100 (81%)
│
├── 2. Calculate deleverage amount
│      $24,300 debt, $30,000 collateral
│      sellAmountUsd = (24300 - 0.6×30000) / (1-0.6) = $15,750
│      sellAmountWeth = $15,750 / $3,028.91 = 5.2 WETH
│
├── 3. Get oracle prices for floor
│      router.getAavePrice(WETH) → 302891000000
│      router.getAavePrice(USDC) → 99970000
│
├── 4. Calculate min buy amount
│      router.calculateMinBuyAmount(
│          5.2e18,           // 5.2 WETH
│          100,              // 1% slippage
│          302891000000,     // WETH price
│          99970000,         // USDC price
│          18, 6             // decimals
│      ) → 15,594,426,000    (15,594.43 USDC)
│
└── 5. Return GPv2Order
       sellToken: WETH
       buyToken: USDC
       sellAmount: 5.2e18
       buyAmount: 15,594,426,000  ← Oracle floor
       receiver: KapanADLHandler

CoW solvers compete:
├── Solver A: "I can give 15,700 USDC" (0.7% better than floor)
├── Solver B: "I can give 15,680 USDC"
└── Winner: Solver A

Post-execution:
├── User receives: 15,700 USDC (surplus over floor!)
├── Handler repays debt
└── New LTV: 60%
```

### Exchange Rate: The Universal Approach

For ADL, we don't actually need USD prices - we need **exchange rates** (how many loan tokens per collateral token). USD is just an intermediate step that can introduce complexity.

#### The Problem with USD Prices

Different protocols have different price formats:
- **Aave/Venus**: 8-decimal USD prices
- **Compound WETH market**: Prices in ETH terms, not USD!
- **Morpho**: 36-decimal exchange rate (not USD at all)

#### The Solution: Normalize to Exchange Rate

All calculations are based on a standardized 18-decimal exchange rate:

```solidity
// Core function: takes exchange rate directly
function calculateMinBuyFromRate(
    uint256 sellAmount,       // in sellToken decimals
    uint256 maxSlippageBps,   // e.g., 100 = 1%
    uint256 exchangeRate18,   // how many buyTokens per sellToken, 18 decimals
    uint8 sellDecimals,
    uint8 buyDecimals
) external pure returns (uint256 minBuyAmount) {
    // Step 1: Apply exchange rate
    uint256 rawBuyAmount = (sellAmount * exchangeRate18) / 1e18;

    // Step 2: Adjust for decimal difference
    if (buyDecimals >= sellDecimals) {
        minBuyAmount = rawBuyAmount * (10 ** (buyDecimals - sellDecimals));
    } else {
        minBuyAmount = rawBuyAmount / (10 ** (sellDecimals - buyDecimals));
    }

    // Step 3: Apply slippage
    minBuyAmount = (minBuyAmount * (10000 - maxSlippageBps)) / 10000;
}
```

#### Converting USD Prices to Exchange Rate

When you have USD prices (same decimals for both), convert to exchange rate:

```solidity
// Helper: USD prices → exchange rate
function usdPricesToExchangeRate(
    uint256 sellPriceUsd,
    uint256 buyPriceUsd
) external pure returns (uint256 exchangeRate18) {
    return (sellPriceUsd * 1e18) / buyPriceUsd;
}

// Convenience wrapper that takes USD prices
function calculateMinBuyAmount(
    uint256 sellAmount,
    uint256 maxSlippageBps,
    uint256 sellPriceUsd,    // any decimals
    uint256 buyPriceUsd,     // same decimals as sellPriceUsd
    uint8 sellDecimals,
    uint8 buyDecimals
) external view returns (uint256 minBuyAmount) {
    uint256 exchangeRate18 = (sellPriceUsd * 1e18) / buyPriceUsd;
    return this.calculateMinBuyFromRate(sellAmount, maxSlippageBps, exchangeRate18, sellDecimals, buyDecimals);
}
```

**Why this works for Compound WETH markets:** If both prices are in ETH terms, they still produce the correct exchange rate when divided!

#### Morpho: Already an Exchange Rate

Morpho oracles return a 36-decimal exchange rate directly (no USD conversion needed):

```solidity
function calculateMorphoMinBuyAmount(
    uint256 sellAmount,
    uint256 maxSlippageBps,
    uint256 morphoOraclePrice  // 36 decimals, already decimal-adjusted
) external pure returns (uint256 minBuyAmount) {
    // Morpho's oracle already accounts for token decimals
    minBuyAmount = (sellAmount * morphoOraclePrice) / 1e36;
    minBuyAmount = (minBuyAmount * (10000 - maxSlippageBps)) / 10000;
}
```

### Test Results

| Conversion | Method | Result |
|------------|--------|--------|
| 1 WETH → USDC | USD prices | 2999.48 USDC ✓ |
| 3000 USDC → WETH | USD prices | 0.98 WETH ✓ |
| 0.1 WBTC → USDC | USD prices | 8921.78 USDC ✓ |
| 1 wstETH → USDC | Morpho oracle | 3673.76 USDC ✓ |
| 1 WETH @ rate=3000 | Direct rate | 2970.00 USDC ✓ |

### Summary: Which Function to Use

| Source | Function | Notes |
|--------|----------|-------|
| Aave/Compound/Venus USD prices | `calculateMinBuyAmount()` | Converts to rate internally |
| Direct exchange rate | `calculateMinBuyFromRate()` | Core calculation |
| Morpho oracle | `calculateMorphoMinBuyAmount()` | Uses 36-decimal rate |

The exchange rate approach unifies all protocols - whether you start with USD prices or a direct rate, the math is the same.

---

## Generic Conditional Order Architecture

### The Evolution: From ADL to Pluggable Triggers

The initial ADL design focused specifically on LTV-based triggers. However, we want a more flexible system:

- **Gateway-agnostic**: Works with any lending protocol (Aave, Compound, Morpho, Euler, etc.)
- **Trigger-agnostic**: Not just LTV, but any condition (price, time, health factor, etc.)
- **Composable**: Leverages CoW Protocol's `ComposableCoW` framework

This generalizes "ADL Handler" into a "Conditional Order System" where ADL becomes one trigger type among many.

### CoW Protocol's ComposableCoW Pattern

CoW Protocol already provides infrastructure for conditional orders via `ComposableCoW`:

```
ComposableCoW Registry
├── TWAP orders (time-based chunks)
├── StopLoss orders (price threshold)
├── GoodAfterTime orders (delayed execution)
└── Custom handlers (KapanOrderHandler, etc.)
```

Each handler implements `IConditionalOrderGenerator`:

```solidity
interface IConditionalOrderGenerator {
    function getTradeableOrder(
        address owner,
        address sender,
        bytes32 ctx,
        bytes calldata staticInput,
        bytes calldata offchainInput
    ) external view returns (GPv2Order.Data memory order);
}
```

The key insight: **We can create a generic Kapan handler that delegates trigger logic to pluggable contracts.**

### Design: Pluggable Trigger System

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    KapanConditionalOrderManager                          │
│  (Central registry, stores orders, handles execution)                    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ Order Context                                                        ││
│  │  - trigger: IOrderTrigger (pluggable!)                              ││
│  │  - preInstructions: LendingInstruction[] (template)                 ││
│  │  - postInstructions: LendingInstruction[] (template)                ││
│  │  - sellToken, buyToken, chunkSize, etc.                             ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
            │  LtvTrigger   │ │ PriceTrigger  │ │ TimeTrigger   │
            │  (ADL)        │ │ (Stop Loss)   │ │ (TWAP-like)   │
            │               │ │               │ │               │
            │ shouldExecute │ │ shouldExecute │ │ shouldExecute │
            │ calcAmount    │ │ calcAmount    │ │ calcAmount    │
            └───────────────┘ └───────────────┘ └───────────────┘
```

### IOrderTrigger Interface

```solidity
/// @title IOrderTrigger
/// @notice Interface for pluggable order triggers
interface IOrderTrigger {
    /// @notice Check if order should execute
    /// @param staticData Encoded trigger-specific parameters
    /// @param owner The order owner
    /// @return shouldExecute True if trigger condition is met
    /// @return reason Human-readable reason for the result
    function shouldExecute(
        bytes calldata staticData,
        address owner
    ) external view returns (bool shouldExecute, string memory reason);

    /// @notice Calculate execution amounts when trigger fires
    /// @param staticData Encoded trigger-specific parameters
    /// @param owner The order owner
    /// @return sellAmount Amount to sell in this execution
    /// @return minBuyAmount Minimum amount to receive (with slippage)
    function calculateExecution(
        bytes calldata staticData,
        address owner
    ) external view returns (uint256 sellAmount, uint256 minBuyAmount);
}
```

### LtvTrigger Implementation (ADL)

```solidity
/// @title LtvTrigger
/// @notice Triggers when position LTV exceeds threshold
contract LtvTrigger is IOrderTrigger {
    IKapanViewRouter public immutable viewRouter;

    struct TriggerParams {
        bytes4 protocolId;           // e.g., bytes4("aave")
        bytes protocolContext;       // market params, sub-account, etc.
        uint256 triggerLtvBps;       // e.g., 8000 = 80%
        uint256 targetLtvBps;        // e.g., 6000 = 60%
        address collateralToken;
        address debtToken;
        uint256 maxSlippageBps;
    }

    function shouldExecute(
        bytes calldata staticData,
        address owner
    ) external view override returns (bool, string memory) {
        TriggerParams memory params = abi.decode(staticData, (TriggerParams));

        uint256 currentLtv = viewRouter.getCurrentLtvBps(
            params.protocolId,
            owner,
            params.protocolContext
        );

        if (currentLtv > params.triggerLtvBps) {
            return (true, "LTV threshold exceeded");
        }
        return (false, "LTV below threshold");
    }

    function calculateExecution(
        bytes calldata staticData,
        address owner
    ) external view override returns (uint256 sellAmount, uint256 minBuyAmount) {
        TriggerParams memory params = abi.decode(staticData, (TriggerParams));

        // 1. Get current position
        (uint256 collateralUsd, uint256 debtUsd) = viewRouter.getPositionValue(
            params.protocolId,
            owner,
            params.protocolContext
        );

        // 2. Calculate deleverage amount to reach target LTV
        // Formula: X = (debt - targetLtv * collateral) / (1 - targetLtv)
        uint256 deleverageUsd = _calculateDeleverageAmount(
            collateralUsd,
            debtUsd,
            params.targetLtvBps
        );

        // 3. Convert USD to collateral token amount
        uint256 collateralPrice = viewRouter.getPrice(
            params.protocolId,
            params.collateralToken,
            params.protocolContext
        );
        sellAmount = (deleverageUsd * 1e18) / collateralPrice;

        // 4. Calculate min buy amount with exchange rate
        uint256 exchangeRate = viewRouter.getExchangeRate(
            params.protocolId,
            params.collateralToken,
            params.debtToken,
            params.protocolContext
        );
        minBuyAmount = viewRouter.calculateMinBuyFromRate(
            sellAmount,
            params.maxSlippageBps,
            exchangeRate,
            18, // collateral decimals (varies per token)
            6   // debt decimals (varies per token)
        );
    }
}
```

### UTXO Injection Pattern

The key innovation: **Pre/post hooks inject dynamic amounts as UTXO[0]** for instructions to reference.

#### Current Pattern (KapanOrderManager)

```solidity
struct OrderContext {
    OrderParams params;
    OrderStatus status;
    uint256 createdAt;
    uint256 executedAmount;
    uint256 iterationCount;
}

// Pre-hook: withdraw collateral based on order params
function _executePreHook(bytes32 orderHash) internal {
    OrderContext storage ctx = orders[orderHash];
    // Fixed withdrawal amount from params
    uint256 withdrawAmount = ctx.params.chunkSize;
    // Execute withdraw instruction
}

// Post-hook: repay debt with received amount
function _executePostHook(bytes32 orderHash) internal {
    // buyAmount comes from swap result
    uint256 buyAmount = IERC20(buyToken).balanceOf(address(this));
    // Execute repay instruction
}
```

#### New Pattern: Dynamic UTXO Injection

```solidity
/// @notice UTXO injection for dynamic amounts
struct UtxoInjection {
    uint8 index;      // which UTXO slot (0 = amount from trigger/swap)
    uint256 value;    // the dynamic value
}

/// @notice Order context with trigger and instruction templates
struct ConditionalOrderContext {
    // Trigger configuration
    address trigger;              // IOrderTrigger contract
    bytes triggerStaticData;      // params for trigger.shouldExecute()

    // Instruction templates (reference UTXO indices, not fixed amounts)
    LendingInstruction[] preInstructions;   // e.g., Withdraw collateral
    LendingInstruction[] postInstructions;  // e.g., Repay debt

    // Swap configuration
    address sellToken;
    address buyToken;
    uint256 maxSlippageBps;

    // State
    OrderStatus status;
    uint256 executedAmount;
}
```

#### Pre-Hook Injection Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Pre-Hook Execution                               │
│                                                                      │
│  1. Trigger.calculateExecution() → (sellAmount, minBuyAmount)        │
│                                                                      │
│  2. Inject UTXO[0] = sellAmount                                     │
│     ┌──────────────────────────────────────────────────────────────┐│
│     │ UTXO State:                                                  ││
│     │   [0] = sellAmount (e.g., 5.2 ETH to withdraw)              ││
│     └──────────────────────────────────────────────────────────────┘│
│                                                                      │
│  3. Execute preInstructions with UTXO context:                      │
│     ┌──────────────────────────────────────────────────────────────┐│
│     │ Instruction[0]: WithdrawCollateral                           ││
│     │   token: WETH                                                ││
│     │   amount: 0 (use input)                                      ││
│     │   input: InputPtr(0) → reads UTXO[0] = 5.2 ETH              ││
│     └──────────────────────────────────────────────────────────────┘│
│                                                                      │
│  4. Gateway executes: withdraw 5.2 ETH from user's Aave position    │
└─────────────────────────────────────────────────────────────────────┘
```

#### Post-Hook Injection Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Post-Hook Execution                              │
│                                                                      │
│  1. Swap completed: received USDC from CoW settlement               │
│     actualBuyAmount = USDC.balanceOf(this)                          │
│                                                                      │
│  2. Inject UTXO[0] = actualBuyAmount                                │
│     ┌──────────────────────────────────────────────────────────────┐│
│     │ UTXO State:                                                  ││
│     │   [0] = actualBuyAmount (e.g., 15,700 USDC received)        ││
│     └──────────────────────────────────────────────────────────────┘│
│                                                                      │
│  3. Execute postInstructions with UTXO context:                     │
│     ┌──────────────────────────────────────────────────────────────┐│
│     │ Instruction[0]: Repay                                        ││
│     │   token: USDC                                                ││
│     │   amount: 0 (use input)                                      ││
│     │   input: InputPtr(0) → reads UTXO[0] = 15,700 USDC          ││
│     └──────────────────────────────────────────────────────────────┘│
│                                                                      │
│  4. Gateway executes: repay 15,700 USDC to user's Aave debt         │
└─────────────────────────────────────────────────────────────────────┘
```

### Instruction Templates

Instructions are defined as **templates** with `InputPtr` references instead of fixed amounts:

```solidity
// ADL Order: Withdraw collateral (pre) → Swap → Repay debt (post)

preInstructions = [
    LendingInstruction({
        op: LendingOp.WithdrawCollateral,
        token: WETH,
        user: userAddress,
        amount: 0,                    // 0 = use input
        context: abi.encode(...),     // protocol-specific
        input: InputPtr(0)            // ← reads from UTXO[0]
    })
];

postInstructions = [
    LendingInstruction({
        op: LendingOp.Repay,
        token: USDC,
        user: userAddress,
        amount: 0,                    // 0 = use input
        context: abi.encode(...),     // protocol-specific
        input: InputPtr(0)            // ← reads from UTXO[0]
    })
];
```

### Complete Execution Flow

```
User creates Conditional Order:
├── Trigger: LtvTrigger @ address(0x123)
├── TriggerParams: {protocolId: "aave", triggerLtv: 8000, targetLtv: 6000, ...}
├── PreInstructions: [WithdrawCollateral(WETH, input=UTXO[0])]
├── PostInstructions: [Repay(USDC, input=UTXO[0])]
└── Tokens: sell=WETH, buy=USDC

CoW Solver polls getTradeableOrder():
│
├── 1. Check trigger
│      trigger.shouldExecute(triggerStaticData, user)
│      → (true, "LTV threshold exceeded")
│
├── 2. Calculate amounts
│      trigger.calculateExecution(triggerStaticData, user)
│      → (sellAmount: 5.2 ETH, minBuyAmount: 15,594 USDC)
│
├── 3. Build GPv2Order
│      sellToken: WETH
│      buyToken: USDC
│      sellAmount: 5.2e18
│      buyAmount: 15,594e6
│      receiver: OrderManager
│
└── 4. Return order to solver

Solver executes swap via CoW Protocol

Settlement calls OrderManager hooks:
│
├── Pre-Hook (before swap)
│      1. Inject UTXO[0] = sellAmount (5.2 ETH)
│      2. Execute preInstructions
│         → Withdraw 5.2 WETH from user's Aave position
│      3. Transfer WETH to Settlement for swap
│
├── Swap executes on CoW
│      5.2 WETH → 15,700 USDC (price improvement!)
│
└── Post-Hook (after swap)
       1. Receive 15,700 USDC from swap
       2. Inject UTXO[0] = 15,700 USDC
       3. Execute postInstructions
          → Repay 15,700 USDC to user's Aave debt
       4. User's LTV is now ~60%
```

### Abstract Contract: KapanConditionalOrderManager

```solidity
/// @title KapanConditionalOrderManager
/// @notice Manages conditional orders with pluggable triggers
abstract contract KapanConditionalOrderManager is IERC1271, IConditionalOrderGenerator {

    struct ConditionalOrder {
        // Trigger
        IOrderTrigger trigger;
        bytes triggerStaticData;

        // Instructions
        LendingInstruction[] preInstructions;
        LendingInstruction[] postInstructions;

        // Swap params
        address sellToken;
        address buyToken;
        uint256 maxSlippageBps;

        // State
        OrderStatus status;
        uint256 executedAmount;
        uint256 totalAmount;  // if chunked
    }

    mapping(bytes32 => ConditionalOrder) public orders;

    // ============ IConditionalOrderGenerator ============

    function getTradeableOrder(
        address owner,
        address sender,
        bytes32 ctx,
        bytes calldata staticInput,
        bytes calldata offchainInput
    ) external view override returns (GPv2Order.Data memory order) {
        bytes32 orderHash = abi.decode(staticInput, (bytes32));
        ConditionalOrder storage o = orders[orderHash];

        // 1. Check trigger
        (bool shouldExecute, ) = o.trigger.shouldExecute(o.triggerStaticData, owner);
        if (!shouldExecute) {
            revert PollTryNextBlock("trigger_not_met");
        }

        // 2. Calculate amounts
        (uint256 sellAmount, uint256 minBuyAmount) = o.trigger.calculateExecution(
            o.triggerStaticData,
            owner
        );

        // 3. Build order
        order = GPv2Order.Data({
            sellToken: IERC20(o.sellToken),
            buyToken: IERC20(o.buyToken),
            receiver: address(this),
            sellAmount: sellAmount,
            buyAmount: minBuyAmount,
            validTo: uint32(block.timestamp + CHUNK_WINDOW),
            appData: appDataHash,
            feeAmount: 0,
            kind: GPv2Order.KIND_SELL,
            partiallyFillable: false,
            sellTokenBalance: GPv2Order.BALANCE_ERC20,
            buyTokenBalance: GPv2Order.BALANCE_ERC20
        });
    }

    // ============ Hook Execution ============

    function executePreHook(bytes32 orderHash) external {
        ConditionalOrder storage o = orders[orderHash];

        // Get sell amount from trigger
        (uint256 sellAmount, ) = o.trigger.calculateExecution(
            o.triggerStaticData,
            o.owner
        );

        // Inject UTXO[0] = sellAmount
        uint256[] memory utxoValues = new uint256[](1);
        utxoValues[0] = sellAmount;

        // Execute pre-instructions with UTXO context
        _executeInstructions(o.preInstructions, utxoValues);
    }

    function executePostHook(bytes32 orderHash) external {
        ConditionalOrder storage o = orders[orderHash];

        // Get actual received amount
        uint256 buyAmount = IERC20(o.buyToken).balanceOf(address(this));

        // Inject UTXO[0] = buyAmount
        uint256[] memory utxoValues = new uint256[](1);
        utxoValues[0] = buyAmount;

        // Execute post-instructions with UTXO context
        _executeInstructions(o.postInstructions, utxoValues);
    }

    function _executeInstructions(
        LendingInstruction[] memory instructions,
        uint256[] memory utxoValues
    ) internal {
        for (uint256 i = 0; i < instructions.length; i++) {
            LendingInstruction memory inst = instructions[i];

            // Resolve amount from UTXO if needed
            uint256 amount = inst.amount;
            if (amount == 0 && inst.input.index < utxoValues.length) {
                amount = utxoValues[inst.input.index];
            }

            // Execute via gateway
            _executeInstruction(inst.op, inst.token, inst.user, amount, inst.context);
        }
    }
}
```

### Other Trigger Examples

#### PriceTrigger (Stop Loss / Take Profit)

```solidity
contract PriceTrigger is IOrderTrigger {
    struct TriggerParams {
        address token;
        address priceOracle;
        uint256 triggerPrice;    // price threshold
        bool triggerAbove;       // true = take profit, false = stop loss
        uint256 sellAmount;      // fixed amount to sell
        uint256 minBuyAmount;    // minimum output
    }

    function shouldExecute(
        bytes calldata staticData,
        address owner
    ) external view returns (bool, string memory) {
        TriggerParams memory p = abi.decode(staticData, (TriggerParams));
        uint256 currentPrice = IOracle(p.priceOracle).getPrice(p.token);

        if (p.triggerAbove && currentPrice >= p.triggerPrice) {
            return (true, "Price above threshold");
        }
        if (!p.triggerAbove && currentPrice <= p.triggerPrice) {
            return (true, "Price below threshold");
        }
        return (false, "Price condition not met");
    }
}
```

#### HealthFactorTrigger (Aave-specific)

```solidity
contract HealthFactorTrigger is IOrderTrigger {
    struct TriggerParams {
        address aavePool;
        uint256 minHealthFactor;  // e.g., 1.1e18
        address collateralToken;
        address debtToken;
        uint256 targetHealthFactor;
    }

    function shouldExecute(
        bytes calldata staticData,
        address owner
    ) external view returns (bool, string memory) {
        TriggerParams memory p = abi.decode(staticData, (TriggerParams));
        (,,,,,uint256 healthFactor) = IPool(p.aavePool).getUserAccountData(owner);

        if (healthFactor < p.minHealthFactor) {
            return (true, "Health factor too low");
        }
        return (false, "Health factor OK");
    }
}
```

### Testing Strategy

#### The Challenge

Testing conditional orders end-to-end requires CoW Protocol settlement, which is complex to mock.

#### Approach: TestSettler Contract

```solidity
/// @title TestSettler
/// @notice Mock CoW settlement for testing conditional orders
contract TestSettler {
    /// @notice Simulate a CoW swap execution
    function simulateSwap(
        address orderManager,
        bytes32 orderHash,
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 buyAmount
    ) external {
        // 1. Call pre-hook
        KapanConditionalOrderManager(orderManager).executePreHook(orderHash);

        // 2. Transfer sellToken from OrderManager
        IERC20(sellToken).transferFrom(orderManager, address(this), sellAmount);

        // 3. Simulate swap: transfer buyToken to OrderManager
        IERC20(buyToken).transfer(orderManager, buyAmount);

        // 4. Call post-hook
        KapanConditionalOrderManager(orderManager).executePostHook(orderHash);
    }
}
```

#### Fork Test Example

```typescript
describe("Conditional Order ADL", () => {
    it("should deleverage when LTV exceeds threshold", async () => {
        // Setup: User has Aave position at 75% LTV
        await setupAavePosition(user, {
            collateral: { token: WETH, amount: parseEther("10") },
            debt: { token: USDC, amount: parseUnits("22500", 6) }
        });

        // Create ADL order: trigger at 80% LTV, target 60% LTV
        const orderHash = await orderManager.createOrder({
            trigger: ltvTrigger.address,
            triggerStaticData: encodeTriggerParams({
                protocolId: "aave",
                triggerLtvBps: 8000,
                targetLtvBps: 6000,
                collateralToken: WETH,
                debtToken: USDC
            }),
            preInstructions: [withdrawInstruction],
            postInstructions: [repayInstruction],
            sellToken: WETH,
            buyToken: USDC
        });

        // Verify order not triggerable yet (LTV = 75%)
        expect(await ltvTrigger.shouldExecute(triggerData, user)).to.equal(false);

        // Simulate price drop: ETH $3000 → $2500
        await mockOracle.setPrice(WETH, parseUnits("2500", 8));
        // New LTV: $22500 / ($2500 * 10) = 90%

        // Now trigger should fire
        const [shouldExecute, reason] = await ltvTrigger.shouldExecute(triggerData, user);
        expect(shouldExecute).to.be.true;
        expect(reason).to.equal("LTV threshold exceeded");

        // Calculate expected amounts
        const [sellAmount, minBuyAmount] = await ltvTrigger.calculateExecution(triggerData, user);
        // sellAmount ≈ 3.75 ETH to reach 60% LTV

        // Simulate CoW execution
        await testSettler.simulateSwap(
            orderManager.address,
            orderHash,
            WETH,
            USDC,
            sellAmount,
            minBuyAmount.mul(101).div(100)  // 1% price improvement
        );

        // Verify final state
        const finalLtv = await viewRouter.getCurrentLtvBps("aave", user, "0x");
        expect(finalLtv).to.be.closeTo(6000, 100);  // ~60% ± 1%
    });
});
```

### Advantages of This Architecture

1. **Separation of Concerns**
   - Triggers handle "when to execute" logic
   - OrderManager handles "how to execute" logic
   - Instructions handle "what to execute" logic

2. **Reusability**
   - Same triggers work across different protocols
   - Same instruction patterns work with different triggers
   - Easy to add new trigger types without changing core contracts

3. **Testability**
   - Triggers can be unit tested in isolation
   - UTXO injection can be tested without CoW
   - Full integration tested with TestSettler

4. **Flexibility**
   - Combine triggers (AND/OR logic)
   - Chain instructions for complex operations
   - Support chunked/TWAP-style execution

### Implementation Status

1. [x] ~~Implement `IOrderTrigger` interface~~ - See `contracts/v2/interfaces/IOrderTrigger.sol`
2. [x] ~~Implement `LtvTrigger` contract~~ - See `contracts/v2/triggers/LtvTrigger.sol`
3. [x] ~~Implement `KapanConditionalOrderManager` contract~~ - See `contracts/v2/cow/KapanConditionalOrderManager.sol`
4. [x] ~~Create `TestSettler` for testing~~ - See `contracts/v2/test/TestSettler.sol`
5. [x] ~~Write fork tests for ADL scenario~~ - See `test/v2/ADLIntegration.fork.ts`, `test/v2/LtvTrigger.fork.ts`
6. [ ] Implement additional triggers (Price, HealthFactor, etc.)
7. [ ] Frontend: Generic conditional order creation UI

---

## Order Manager Comparison

This section documents the differences and commonalities between the original `KapanOrderManager` and the new `KapanConditionalOrderManager`.

### Common Architecture

Both order managers share these fundamental patterns:

| Feature | Both Managers |
|---------|---------------|
| **CoW Integration** | Register with ComposableCoW, implement IConditionalOrderGenerator |
| **ERC-1271** | Act as ERC-1271 signers for order validation |
| **Hook Pattern** | Pre-hook (before swap) and post-hook (after swap) |
| **UTXO Injection** | Prepend ToOutput instruction with dynamic amount |
| **Balance Delta** | Track balances before/after hooks for accurate amounts |
| **Instruction Execution** | Route instructions through KapanRouter |
| **User Validation** | Verify all instructions target the order owner |
| **Vault Relayer Approval** | Ensure CoW vault relayer can spend tokens |
| **Order Lifecycle** | Active → Completed/Cancelled states |

### Key Differences

| Aspect | KapanOrderManager | KapanConditionalOrderManager |
|--------|-------------------|------------------------------|
| **Trigger Model** | None - orders are always valid | Pluggable `IOrderTrigger` contracts |
| **Amount Calculation** | Fixed `chunkSize` / `minBuyPerChunk` | Dynamic via `trigger.calculateExecution()` |
| **Chunking** | Fixed number of iterations via `preTotalAmount / chunkSize` | `numChunks` in trigger params divides calculated amount |
| **Completion** | `CompletionType` enum (TargetLTV, TargetBalance, Iterations, UntilCancelled) | `maxIterations` (0 = unlimited) |
| **Instructions** | Per-iteration arrays (`preInstructionsPerIteration[]`) | Single template (`preInstructions`, `postInstructions`) |
| **Order Kind** | Supports KIND_BUY and KIND_SELL | KIND_SELL only |
| **Flash Loan** | `isFlashLoanOrder` flag + CowAdapter integration | Not supported (uses pre-hook withdrawals) |
| **Seed Tokens** | User deposits seed tokens at order creation | No seed deposit |
| **Use Case** | TWAP-like swaps, fixed-chunk operations | Conditional triggers (ADL, stop-loss) |

### Detailed Comparison

#### Amount Determination

**KapanOrderManager:**
```solidity
struct KapanOrderParams {
    uint256 chunkSize;          // Fixed sell amount per iteration
    uint256 minBuyPerChunk;     // Fixed minimum buy amount (slippage)
    uint256 preTotalAmount;     // Total to process across all chunks
    // ...
}
```
Amounts are fixed at order creation. Each iteration uses `chunkSize` until `preTotalAmount` is exhausted.

**KapanConditionalOrderManager:**
```solidity
struct KapanOrderParams {
    address trigger;            // IOrderTrigger contract
    bytes triggerStaticData;    // Params for trigger (includes numChunks)
    // ...
}

// Amounts calculated dynamically at execution time
(uint256 sellAmount, uint256 minBuyAmount) = trigger.calculateExecution(
    params.triggerStaticData,
    params.user
);
```
Amounts are calculated fresh each time based on current position state.

#### Chunking Mechanism

**KapanOrderManager:**
- Total amount divided into fixed chunks
- `iterations = preTotalAmount / chunkSize`
- Each chunk processes the same `chunkSize`

**KapanConditionalOrderManager (via LtvTrigger):**
```solidity
struct TriggerParams {
    // ...
    uint8 numChunks;    // 0 or 1 = full amount, >1 = divide sellAmount
}

// In calculateExecution:
if (params.numChunks > 1) {
    sellAmount = sellAmount / params.numChunks;
}
```
- Full deleverage amount calculated based on current LTV
- Then divided by `numChunks` for gradual execution
- Each execution re-calculates fresh (remaining debt may change)

#### Instruction Templates

**KapanOrderManager:**
```solidity
struct KapanOrderParams {
    // Array of per-iteration instructions
    bytes[] preInstructionsPerIteration;
    bytes[] postInstructionsPerIteration;
    // If array shorter than iterations, last entry reused
}
```
Allows different instructions for different iterations (e.g., last iteration = deposit only, no borrow).

**KapanConditionalOrderManager:**
```solidity
struct KapanOrderParams {
    bytes preInstructions;      // Single template
    bytes postInstructions;     // Single template
    // Instructions reference UTXO[0] for dynamic amount
}
```
Same template used for all iterations; dynamic amount injected via UTXO.

#### Order Completion

**KapanOrderManager:**
```solidity
enum CompletionType {
    TargetLTV,          // Complete when target LTV reached
    TargetBalance,      // Complete when balance exhausted
    Iterations,         // Complete after N iterations
    UntilCancelled      // Run until manually cancelled
}
```

**KapanConditionalOrderManager:**
```solidity
// Only maxIterations check
if (params.maxIterations > 0 && ctx.iterationCount >= params.maxIterations) {
    ctx.status = OrderStatus.Completed;
}
// Otherwise stays Active, re-triggers when condition met
```

### When to Use Each

| Scenario | Recommended Manager |
|----------|---------------------|
| TWAP-style swaps | KapanOrderManager |
| Fixed-schedule position unwinding | KapanOrderManager |
| Flash-loan funded swaps | KapanOrderManager |
| KIND_BUY orders | KapanOrderManager |
| ADL (automatic deleveraging) | KapanConditionalOrderManager + LtvTrigger |
| Stop-loss orders | KapanConditionalOrderManager + PriceTrigger |
| Health factor protection | KapanConditionalOrderManager + HealthFactorTrigger |
| Recurring conditional actions | KapanConditionalOrderManager |

---

## LtvTrigger Implementation Details

The LtvTrigger is the first production trigger for ADL. Here's the actual implementation:

### TriggerParams Structure

```solidity
struct TriggerParams {
    bytes4 protocolId;           // AAVE_V3, COMPOUND_V3, MORPHO_BLUE, EULER_V2, VENUS
    bytes protocolContext;       // Protocol-specific data (market params, sub-account, etc.)
    uint256 triggerLtvBps;       // LTV threshold to trigger (e.g., 8000 = 80%)
    uint256 targetLtvBps;        // Target LTV after deleverage (e.g., 6000 = 60%)
    address collateralToken;     // Token to sell (withdraw from position)
    address debtToken;           // Token to buy (repay debt)
    uint8 collateralDecimals;    // Decimals of collateral token
    uint8 debtDecimals;          // Decimals of debt token
    uint256 maxSlippageBps;      // Maximum slippage tolerance (e.g., 100 = 1%)
    uint8 numChunks;             // Number of chunks to split deleverage (1 = full, 0 treated as 1)
}
```

### Chunking Behavior

The `numChunks` parameter allows splitting large deleverages across multiple executions:

- **numChunks = 0 or 1**: Execute full deleverage amount in one swap
- **numChunks = 2**: Execute half the calculated amount per trigger
- **numChunks = 5**: Execute 1/5 of the calculated amount per trigger

**Example:**
```
Position: $30,000 collateral, $24,000 debt (80% LTV)
Target LTV: 60%
Full deleverage needed: $15,000

With numChunks = 1: Sell $15,000 of collateral → LTV reaches 60%
With numChunks = 3: Sell $5,000 per trigger → 3 triggers needed to reach 60%
```

Benefits of chunking:
- Reduces market impact for large positions
- Allows price recovery between executions
- Provides more gradual deleveraging
- Reduces single-transaction risk

### Protocol Context

Each protocol requires different context data:

| Protocol | Context Format | Notes |
|----------|----------------|-------|
| AAVE_V3 | `bytes("")` | Uses pool-level position |
| COMPOUND_V3 | `abi.encode(baseToken)` | Market identified by base token |
| MORPHO_BLUE | `abi.encode(MarketParams)` | Full market params struct |
| EULER_V2 | `abi.encode(vault, subAccountIndex)` | Vault + sub-account |
| VENUS | `bytes("")` | Uses comptroller-level position |

### Unified ViewRouter Interface

LtvTrigger uses the KapanViewRouter for protocol-agnostic queries:

```solidity
interface IKapanViewRouter {
    function getCurrentLtv(
        bytes4 protocolId,
        address user,
        bytes calldata context
    ) external view returns (uint256 ltvBps);

    function getPositionValue(
        bytes4 protocolId,
        address user,
        bytes calldata context
    ) external view returns (uint256 collateralValueUsd, uint256 debtValueUsd);

    function getCollateralPrice(
        bytes4 protocolId,
        address collateralToken,
        bytes calldata context
    ) external view returns (uint256 price);

    function getDebtPrice(
        bytes4 protocolId,
        address debtToken,
        bytes calldata context
    ) external view returns (uint256 price);

    function calculateMinBuy(
        bytes4 protocolId,
        uint256 sellAmount,
        uint256 maxSlippageBps,
        address collateralToken,
        address debtToken,
        uint8 collateralDecimals,
        uint8 debtDecimals,
        bytes calldata context
    ) external view returns (uint256 minBuyAmount);
}
```

All values returned in 8-decimal USD format (standard oracle format).

### Decimal Handling

The trigger correctly handles different token decimal combinations:

| Conversion | Example |
|------------|---------|
| 18→6 | wstETH → USDC |
| 8→6 | WBTC → USDC |
| 6→18 | USDC → DAI |
| 18→18 | WETH → DAI |
| 8→8 | WBTC → renBTC |

Formula for sellAmount:
```
sellAmount = (deleverageUsd * 10^collateralDecimals) / collateralPrice
```

### Order Lifecycle for ADL

1. **Order Creation**: User creates conditional order with LtvTrigger
2. **Polling**: CoW solvers call `getTradeableOrder()` periodically
3. **Trigger Check**: LtvTrigger checks if current LTV > triggerLtvBps
4. **If Not Met**: Returns `PollTryNextBlock` - solver retries later
5. **If Met**: Calculates sellAmount and minBuyAmount
6. **Execution**: Solver submits order, hooks execute
7. **After Execution**: Order stays Active (unless maxIterations reached)
8. **Re-Trigger**: When LTV exceeds threshold again, process repeats

The order remains active indefinitely (unless cancelled or maxIterations reached), providing continuous protection against liquidation

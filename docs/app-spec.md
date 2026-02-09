# Kapan Finance Frontend -- Functional Specification

_Reverse-engineered from codebase as of 2026-02-06_

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [Pages & Routes](#2-pages--routes)
3. [Data Model & Global State](#3-data-model--global-state)
4. [Protocol Coverage](#4-protocol-coverage)
5. [Component Hierarchy](#5-component-hierarchy)
6. [Modal/Action Flows](#6-modalaction-flows)
7. [Hook Return Types by Protocol](#7-hook-return-types-by-protocol)
8. [Unified Position Type Analysis](#8-unified-position-type-analysis)
9. [API Routes](#9-api-routes)
10. [Network Coverage Matrix](#10-network-coverage-matrix)
11. [Markets Page Redesign (Planned)](#11-markets-page-redesign-planned)

---

## 1. Application Overview

Kapan Finance is a DeFi lending aggregator that provides a single dashboard for viewing and managing lending/borrowing positions across multiple protocols and chains. The core value propositions are:

- **Cross-protocol visibility**: See positions on Aave, Compound, Venus, Morpho Blue, Euler, Spark, ZeroLend, Nostra, and Vesu from one dashboard.
- **Atomic operations**: Deposit, withdraw, borrow, repay, refinance (move debt), swap collateral, swap debt, close positions, and leverage/loop -- all executed atomically via flash loans.
- **Zero protocol fees**: Users pay only gas and swap routing fees.
- **Multi-chain**: Supports Ethereum, Arbitrum, Base, Optimism, Linea, Unichain, Plasma (EVM) and Starknet.

### Tech Stack

- **Framework**: Next.js 16, React 19, App Router
- **Styling**: TailwindCSS + DaisyUI
- **State**: Zustand (global), React Query (server)
- **EVM**: wagmi, viem, RainbowKit
- **Starknet**: starknet-react
- **Animations**: framer-motion

---

## 2. Pages & Routes

### 2.1 Public Pages

| Route | File | Description |
|-------|------|-------------|
| `/` | `app/page.tsx` | Landing page. Renders `StickyLanding` component with organization schema for SEO. |
| `/about` | `app/about/page.tsx` | About page. Describes the protocol, team, and vision. |
| `/blog` | `app/blog/page.tsx` | Blog listing page. Shows sorted blog posts. |
| `/blog/[slug]` | `app/blog/[slug]/page.tsx` | Individual blog post. |
| `/info` | `app/info/page.tsx` | FAQ page. Explains how the protocol works, safety, cost, and capabilities. |
| `/privacy` | `app/privacy/page.tsx` | Privacy policy. |
| `/license` | `app/license/page.tsx` | License information. |
| `/markets` | `app/markets/page.tsx` | Rate comparison page. Shows lending/borrowing rates across protocols and chains. |

### 2.2 Application Pages

| Route | File | Description |
|-------|------|-------------|
| `/app` | `app/app/page.tsx` | **Main dashboard**. Shows all user positions across protocols for the selected network. Contains network switcher, dashboard metrics, and protocol views. |
| `/orders` | `app/orders/page.tsx` | **Orders list**. Shows all conditional orders (ADL, Auto-Leverage, Limit) grouped by status (Active, Completed, Cancelled). |
| `/orders/[orderHash]` | `app/orders/[orderHash]/page.tsx` | **Order detail**. Shows full order details including token pair, progress, execution history, statistics, and order parameters. |

### 2.3 Main Dashboard (`/app`) -- Detailed Behavior

The main dashboard is the core of the application. Its structure:

1. **Header Row**: Title "Positions" + DashboardMetrics (Net Worth, Total Supply, Total Debt) + NetworkFilter
2. **Network Warning Banner**: Experimental/pre-audit warning per chain
3. **Protocol Sections**: Vertically stacked, one per protocol available on the selected network. Each section:
   - Starts **collapsed** by default
   - **Auto-expands** when the user has positions in that protocol
   - Contains a header card with protocol name, icon, metrics (Balance, 30D Yield, Net APY, Utilization/LTV)
   - Contains expandable Markets section (shows all available assets and their rates)
   - Contains Supplied and Borrowed position lists

**Network -> Protocol mapping**:

| Network | Protocols |
|---------|-----------|
| Ethereum | Aave, Morpho, Spark, Euler, Compound |
| Base | Morpho, Aave, Euler, ZeroLend, Compound, Venus |
| Unichain | Morpho, Euler, Compound, Venus |
| Arbitrum | Aave, Morpho, Euler, Compound, Venus |
| Optimism | Aave, Morpho, Euler, Compound |
| Linea | Aave, ZeroLend, Euler, Compound |
| Plasma | Aave, Euler |
| Starknet | Vesu, Nostra |
| Hardhat (dev) | Aave, Morpho, Euler, Compound |

Each EVM network also shows a **WalletSection** that displays the user's wallet token balances with swap functionality.

### 2.4 Markets Page (`/markets`) -- Detailed Behavior

- **Network Filter**: Same set of networks (Base, Arbitrum, Optimism, Linea, Starknet)
- **View Controls**: Grid/List toggle, Token/Protocol grouping toggle, Search filter
- **Data Sources**: Aave markets, Compound markets, Venus markets per EVM chain; Vesu/Nostra markets for Starknet
- Lazy-loads protocol market components to reduce bundle size

### 2.5 Orders Pages

**`/orders`**: Lists all conditional orders for the connected wallet. Features:
- Groups by status: Active, Completed, Cancelled
- Each order row shows: Order type badge (ADL / Auto Leverage / Limit), protocol badge, trigger status, token pair, LTV trigger/target, progress bar, cancel action
- Order types are determined by comparing the trigger contract address

**`/orders/[orderHash]`**: Detailed order view. Features:
- Token pair hero display (sell -> buy) with status badge
- Progress bar (chunks completed / total)
- Stats grid: Total Sold, Total Received, Surplus, Execution Rate (all with USD values)
- Order Parameters: Chunk size, Min buy per chunk, Min rate, Rate improvement, Flash loan status, Min health factor
- Execution History: Per-chunk details with sell/buy amounts, surplus percentage, and tx links
- Footer: Order hash, CoW Explorer link, Share/Tweet links

---

## 3. Data Model & Global State

### 3.1 Global State (Zustand)

File: `/workspaces/kapan/packages/nextjs/services/store/store.ts`

```typescript
type GlobalState = {
  // Currency prices
  nativeCurrencyPrice: number;
  strkCurrencyPrice: number;

  // Network targeting
  targetEVMNetwork: ChainWithAttributes;
  targetSNNetwork: SNChainWithAttributes;

  // Block numbers
  blockNumber?: bigint;
  snBlockNumber?: bigint;

  // Dashboard aggregation
  protocolTotals: Record<string, { supply: number; borrow: number }>;
  totalSupplied: number;
  totalBorrowed: number;
  totalNet: number;       // totalSupplied - totalBorrowed
  loadedProtocolCount: number;
  expectedProtocolCount: number;

  // Actions
  setProtocolTotals: (protocol: string, supply: number, borrow: number) => void;
  resetTotals: (expectedCount: number) => void;
};
```

Each protocol view reports its totals via `setProtocolTotals()` after loading. The dashboard header shows aggregate metrics and a loading indicator until `loadedProtocolCount === expectedProtocolCount`.

### 3.2 Core Position Type: `ProtocolPosition`

File: `/workspaces/kapan/packages/nextjs/components/ProtocolView.tsx`

This is the **shared type** that all protocol views must produce. It is consumed by `SupplyPosition` and `BorrowPosition` components.

```typescript
interface ProtocolPosition {
  icon: string;                     // Token logo URL
  name: string;                     // Token symbol (e.g., "WETH")
  balance: number;                  // USD value of position
  tokenBalance: bigint;             // Raw token amount in smallest unit
  currentRate: number;              // APY/APR as percentage (e.g., 3.5 = 3.5%)
  tokenAddress: string;             // Token contract address
  tokenPrice?: bigint;              // Price with 8 decimals (Chainlink format)
  usdPrice?: number;                // Token price in USD
  tokenDecimals?: number;           // Token decimal places
  tokenSymbol?: string;             // Token symbol for price feed

  // Compound-specific: collateral assets tied to a borrow position
  collaterals?: SwapAsset[];
  collateralView?: React.ReactNode; // Custom collateral display
  collateralValue?: number;         // USD collateral value

  // Starknet-specific
  vesuContext?: {
    deposit?: VesuContext;
    withdraw?: VesuContext;
    borrow?: VesuContext;
    repay?: VesuContext;
  };

  // Protocol context for instruction encoding
  protocolContext?: string;         // Pre-encoded (Morpho MarketParams, etc.)

  // Refinance support
  moveSupport?: {
    preselectedCollaterals?: CollateralWithAmount[];
    disableCollateralSelection?: boolean;
  };

  // UI state
  actionsDisabled?: boolean;
  actionsDisabledReason?: string;
}
```

### 3.3 SwapAsset Type

Used across modals to represent a token available for swap/selection:

```typescript
interface SwapAsset {
  symbol: string;
  address: string;
  decimals: number;
  rawBalance: bigint;
  balance: number;        // Human-readable balance
  icon: string;
  usdValue?: number;
  price?: bigint;         // 8 decimal precision
  eulerCollateralVault?: string;  // Euler-specific
}
```

---

## 4. Protocol Coverage

### 4.1 Aave V3 (+ Spark, ZeroLend)

**Architecture**: These are Aave-fork protocols sharing `AaveForkProtocolView` and `AaveLike` components.

| Feature | Supported | Notes |
|---------|-----------|-------|
| View positions | Yes | Via `AaveGatewayView.getAllTokensInfo()` on-chain call |
| Deposit | Yes | Through `DepositModal` |
| Withdraw | Yes | Through `WithdrawModal` |
| Borrow | Yes | Through `BorrowModal` via `TokenSelectModal` |
| Repay | Yes | Through `RepayModal` |
| Refinance (move debt) | Yes | Through `RefinanceModal` -> `RefinanceModalEvm` |
| Move Supply | Yes | Through `MoveSupplyModal` |
| Collateral Swap | Yes (configurable) | Through `CollateralSwapModal` (V2) |
| Debt Swap | Yes (configurable) | Through `DebtSwapEvmModal` (V2) |
| Close Position | Yes | Through `CloseWithCollateralEvmModal` (V2) |
| Multiply/Leverage (Loop) | Yes | Through `MultiplyEvmModal` |
| E-Mode | Yes | `EModeToggle` component, filters assets, affects LTV |
| ADL (Auto-Deleverage) | Yes | Through `LTVAutomationModal` |
| Auto-Leverage | Yes | Through `LTVAutomationModal` |
| Markets view | Yes | Inline markets section with suppliable/borrowable assets |
| Collateral LTV Breakdown | Yes | Hover tooltip showing per-asset LTV |
| External Yields | Yes | PT tokens (Pendle), LSTs (wstETH), Maple syrup |

**Data flow**: `AaveLike` calls `getAllTokensInfo(userAddress)` on the gateway view contract. Returns all tokens with supply/borrow balances, rates, and prices. Converts to `ProtocolPosition[]`.

**Feature flags**: `enabledFeatures: { swap: boolean; move: boolean }` controls whether collateral swap and move buttons appear.

### 4.2 Compound V3

| Feature | Supported | Notes |
|---------|-----------|-------|
| View positions | Yes | Via `CompoundGatewayView.getCompoundData()` per base token |
| Deposit | Yes | |
| Withdraw | Yes | |
| Borrow | Yes | |
| Repay | Yes | |
| Refinance | Yes | |
| Move Supply | Yes (configurable) | |
| Collateral Swap | Yes (configurable) | |
| Debt Swap | Yes | |
| Close Position | Yes | |
| Multiply/Loop | No | `disableLoop` is true for Compound |
| Markets view | Yes | Inline (uses `inlineMarkets` prop) |
| ADL | Yes | |

**Data architecture**: Compound uses a per-market model. Each base token (WETH, USDC, etc.) has its own market with specific collateral assets. The `protocolContext` is encoded as the market address.

### 4.3 Venus

| Feature | Supported | Notes |
|---------|-----------|-------|
| View positions | Yes | Same structure as Compound |
| All operations | Yes | Same as Compound (Venus is a Compound fork in UI terms) |
| Markets | Yes | Inline markets |

### 4.4 Morpho Blue

| Feature | Supported | Notes |
|---------|-----------|-------|
| View positions | Yes | Via Morpho GraphQL API + on-chain refresh |
| Deposit | Yes | Per-market (collateral) |
| Withdraw | Yes | |
| Borrow | Yes | |
| Repay | Yes | |
| Refinance | Yes | With Morpho-specific context encoding |
| Move Supply | Yes | |
| Collateral Swap | Yes | Custom Morpho modal with market-specific context |
| Debt Swap | Yes | Custom Morpho modal |
| Close Position | Yes | Custom Morpho modal |
| Multiply/Loop | Yes | Through `MultiplyEvmModal` with Morpho context |
| Markets view | Yes | `MorphoMarketsSection` with liquidity-sorted markets |
| ADL | Yes | With Morpho market context |

**Data architecture**: Morpho uses isolated markets identified by `(loanToken, collateralToken, oracle, irm, lltv)`. Positions are fetched via GraphQL API (`useMorphoLendingPositions`) and refreshed on-chain (`useMorphoPositionsRefresh`). Each position is a `MorphoPositionRow` with collateral and debt balances per market.

**Key difference**: Morpho has its own `MorphoProtocolView` that does NOT use `ProtocolView`. Instead it uses `MorphoPositionsSection` which renders positions per-market (showing collateral + debt side by side per market).

### 4.5 Euler V2

| Feature | Supported | Notes |
|---------|-----------|-------|
| View positions | Yes | Via Euler subgraph + on-chain balance/debt queries |
| Deposit (Add Collateral) | Yes | Through `AddEulerCollateralModal` |
| Withdraw | Yes | Through `SupplyPosition`'s `WithdrawModal` |
| Borrow | Yes | Through `EulerBorrowModal` |
| Repay | Yes | Through `BorrowPosition`'s `RepayModal` |
| Refinance | Yes | With Euler sub-account context |
| Collateral Swap | Yes | Custom `CollateralSwapModal` with vault context |
| Debt Swap | Yes | Custom `DebtSwapEvmModal` with sub-account migration |
| Close Position | Yes | Custom `CloseWithCollateralEvmModal` |
| Multiply/Loop | No | Not available in Euler view |
| Markets view | Yes | `EulerMarketsSection` showing vault data |
| ADL | Yes | Through `LTVAutomationModal` with Euler context |
| Sub-accounts | Yes | Euler V2 uses EVC sub-accounts; positions grouped by sub-account |

**Data architecture**: Euler V2 has a unique model with sub-accounts. Each user address has 256 sub-accounts via the Ethereum Vault Connector (EVC). Each sub-account can have 1 controller (debt vault) + N collateral vaults. Positions are displayed as groups (`EulerPositionGroupWithBalances`): collaterals on the left, debt on the right.

**Context encoding**: Euler requires `(borrowVault, collateralVault, subAccountIndex)` encoded together for all operations.

### 4.6 Vesu (Starknet)

| Feature | Supported | Notes |
|---------|-----------|-------|
| View positions | Yes | Via Starknet contract reads (V1 and V2 pools) |
| Deposit | Yes | Through `DepositModalStark` |
| Withdraw | Yes | Through `WithdrawModalStark` |
| Borrow | Yes | Through `BorrowModalStark` |
| Repay | Yes | Through `RepayModalStark` |
| Refinance | Yes | Through `RefinanceModalStark` (Vesu <-> Nostra) |
| Move Supply | No | `disableMoveSupply` on Starknet |
| Multiply/Loop | No | |
| Markets view | Yes | `VesuMarketSection` |
| Pool selection | Yes | V1 pools (Genesis, Re7) + V2 pools |

**Data architecture**: Vesu has multiple pools. V1 pools are identified by `poolId` (bigint), V2 by pool address. Assets return `TokenMetadata` from the gateway with `fee_rate`, `utilization`, `price`, `rate_accumulator`, etc. Positions include `VesuContext` for each operation type (deposit, withdraw, borrow, repay).

### 4.7 Nostra (Starknet)

| Feature | Supported | Notes |
|---------|-----------|-------|
| View positions | Yes | Via `NostraGateway.get_user_positions()` |
| Deposit | Yes | Through Starknet modals |
| Withdraw | Yes | |
| Borrow | Yes | |
| Repay | Yes | |
| Refinance | Yes | Nostra <-> Vesu |
| Move Supply | No | `disableMoveSupply = true` |
| Collateral Swap | No | |
| Close Position | Yes | Via EVM close modal |
| Multiply/Loop | No | `disableLoop = true` |

**Simplicity note**: Nostra uses the generic `ProtocolView` component directly with minimal customization. It has no protocol-specific header elements.

---

## 5. Component Hierarchy

### 5.1 Main Dashboard Component Tree

```
App (app/app/page.tsx)
  DashboardLayout
    DashboardMetrics (net worth, total supply, total debt)
    NetworkFilter
    [per selected network]:
      WalletSection                   -- wallet token balances + swap
      AaveProtocolView                -- wraps AaveForkProtocolView
        AaveLike (data fetcher)       -- calls gateway contract
        AaveForkProtocolView          -- shared Aave-fork logic
          ProtocolView                -- generic protocol display
            SupplyPosition[]          -- per supplied asset
            BorrowPosition[]          -- per borrowed asset
          EModeToggle                 -- E-Mode management
          LTVAutomationModal          -- ADL/Auto-Leverage setup
      MorphoProtocolView              -- custom layout (not ProtocolView)
        BaseProtocolHeader            -- shared header component
        MorphoMarketsSection          -- market browser
        MorphoPositionsSection        -- per-market position cards
      EulerProtocolView               -- custom layout (not ProtocolView)
        BaseProtocolHeader
        EulerMarketsSection
        EulerPositionGroupRow[]       -- per sub-account group
          SupplyPosition[]            -- collateral side
          BorrowPosition              -- debt side
          CollateralSwapModal
          DebtSwapEvmModal
          CloseWithCollateralEvmModal
          AddEulerCollateralModal
          EulerBorrowModal
          LTVAutomationModal
      CompoundProtocolView            -- wraps AaveForkProtocolView pattern
        ProtocolView (inlineMarkets)
      VenusProtocolView               -- same pattern as Compound
      SparkProtocolView               -- wraps AaveForkProtocolView
      ZeroLendProtocolView            -- wraps AaveForkProtocolView
      VesuProtocolView                -- custom Starknet view with pools
      NostraProtocolView              -- thin wrapper over ProtocolView
```

### 5.2 Position Component Architecture

```
BasePosition (common/BasePosition.tsx)
  -- Renders: icon, name, rate, balance, fiat value, action bar
  -- Used by both SupplyPosition and BorrowPosition
  -- Handles: expansion, ADL indicators, disabled state

SupplyPosition (SupplyPosition.tsx)
  -- Extends BasePosition with supply-specific actions
  -- Actions: Deposit, Withdraw, Move, Swap
  -- Modals: DepositModal, WithdrawModal, MoveSupplyModal
  -- Network-aware: EVM modals vs Starknet modals

BorrowPosition (BorrowPosition.tsx)
  -- Extends BasePosition with borrow-specific actions
  -- Actions: Repay, Borrow, Swap (debt), Move, Close
  -- Modals: RepayModal, BorrowModal, RefinanceModal,
             CloseWithCollateralEvmModal, DebtSwapEvmModal
  -- Features: "Better rate" badge (via useOptimalRate), collateral view
  -- Network-aware: EVM modals vs Starknet modals
```

### 5.3 Protocol Header Patterns

There are **two** header patterns in use:

1. **`ProtocolView` (inline header)**: Used by Aave-fork protocols, Compound, Venus, Nostra. Contains protocol icon, name, Balance, 30D Yield, Net APY, Utilization/LTV, Markets toggle, collapse toggle. Header is a clickable card that toggles collapse.

2. **`BaseProtocolHeader`**: Used by Morpho and Euler. A newer, extracted component that takes metrics as a standardized array:
   ```typescript
   interface HeaderMetric {
     label: string;
     mobileLabel?: string;
     value: number | null;
     type: "currency" | "apy" | "custom";
     customRender?: (hasData: boolean) => ReactNode;
   }
   ```

### 5.4 Shared Common Components

| Component | File | Purpose |
|-----------|------|---------|
| `BasePosition` | `common/BasePosition.tsx` | Generic position row (icon, name, rate, balance, actions) |
| `SegmentedActionBar` | `common/SegmentedActionBar.tsx` | Horizontal button bar for position actions |
| `CollapsibleSection` | `common/CollapsibleSection.tsx` | Animated expand/collapse wrapper |
| `Loading` / `LoadingSpinner` | `common/Loading.tsx` | Loading indicators |
| `ErrorDisplay` | `common/ErrorDisplay.tsx` | Error state display |
| `ProtocolLogo` | `common/ProtocolLogo.tsx` | Protocol icon display |
| `ProtocolSelector` | `common/ProtocolSelector.tsx` | Protocol dropdown for refinance |
| `ProtocolSkeleton` | `common/ProtocolSkeleton.tsx` | Loading skeleton for lazy-loaded protocols |
| `StableArea` | `common/StableArea.tsx` | Prevents layout shift during load |
| `PendingOrdersDrawer` | `common/PendingOrdersDrawer.tsx` | Floating drawer for active orders |
| `BaseModal` | `modals/BaseModal.tsx` | Modal shell with overlay and close |
| `TokenActionModal` | `modals/TokenActionModal.tsx` | Generic token action modal (amount input, confirm) |
| `SwapModalShell` | `modals/SwapModalShell.tsx` | Unified swap modal framework |
| `FiatBalance` | `FiatBalance.tsx` | Displays token balance with fiat value |
| `NetworkFilter` | `NetworkFilter.tsx` | Network selector tabs |

---

## 6. Modal/Action Flows

### 6.1 Simple Operations (Deposit, Withdraw, Borrow, Repay)

All simple operations follow the same pattern:

1. User clicks action button on a position row
2. Modal opens (`TokenActionModal` wrapper)
3. User enters amount (with Max button, USD display)
4. On confirm: `useKapanRouterV2` builds the instruction flow
5. `useEvmTransactionFlow` handles: chain switching, authorization transactions, main transaction execution
6. On success: notification displayed, modal closes

**Transaction batching**: If supported, multiple approve + execute transactions can be batched into one.

### 6.2 Refinance (Move Debt)

File: `modals/RefinanceModal.tsx` -> dispatches to `RefinanceModalEvm` or `RefinanceModalStark`

**EVM Flow**:
1. User clicks "Move" on a borrow position
2. Modal shows current protocol and rate
3. User selects target protocol from dropdown (sorted by rate)
4. User optionally adjusts collateral selection
5. System builds flash loan + repay + deposit + borrow flow
6. Multi-step execution: approve collateral, execute router transaction

**Starknet Flow**:
1. Same as EVM but uses Starknet-specific hooks and transaction submission
2. Only moves between Vesu and Nostra

### 6.3 Move Supply

File: `modals/MoveSupplyModal.tsx`

1. User clicks "Move" on a supply position
2. Modal shows current protocol and supply rate
3. Fetches rates from all other protocols for the same token (`useProtocolRates`)
4. User selects target protocol (auto-selects best rate)
5. User enters amount (or uses Max)
6. Builds withdraw-from-source + deposit-to-target flow
7. Executes via KapanRouter

### 6.4 Collateral Swap

File: `modals/CollateralSwapModal.tsx` -> re-exports `CollateralSwapModalV2.tsx`

Uses the unified swap modal architecture (`SwapModalShell`):

1. User clicks "Swap" on a supply position
2. Modal shows current collateral token as "From"
3. User selects target collateral token from available assets
4. Gets swap quote (via 1inch, Kyber, or CoW)
5. Shows price impact, slippage settings
6. Flash loan flow: withdraw collateral -> swap -> deposit new collateral
7. Protocol-specific context encoding (Euler includes vault addresses and sub-account)

### 6.5 Debt Swap

File: `modals/DebtSwapEvmModal.tsx` -> re-exports `DebtSwapModalV2.tsx`

Similar to collateral swap but for the debt side:

1. User clicks "Swap" on a borrow position
2. Modal shows current debt token as "From"
3. User selects target debt token
4. Flash loan flow: borrow new token -> swap -> repay old debt
5. Euler-specific: handles sub-account migration (creates new sub-account if needed, moves collateral)

### 6.6 Close Position with Collateral

File: `modals/CloseWithCollateralEvmModal.tsx` -> re-exports `ClosePositionModalV2.tsx`

1. User clicks "Close" on a borrow position
2. Modal shows debt amount and available collateral tokens
3. User selects which collateral to use for repayment
4. Swap quote fetched for collateral -> debt token
5. Flash loan flow: borrow debt token -> repay debt -> withdraw collateral -> swap excess back
6. Allows partial or full close

### 6.7 Multiply/Leverage (Loop)

File: `modals/MultiplyEvmModal.tsx`

1. User clicks "Add Loop" button in the Supply section
2. Modal shows collateral and debt token selectors
3. User selects leverage multiplier (1x-10x depending on LTV)
4. System calculates: flash loan amount, collateral out, net APY, fee breakdown
5. Shows predictive LTV and liquidation info
6. Swap router selection (1inch, Kyber, Pendle)
7. Flash loan provider selection (Balancer V2/V3, Aave, Uniswap, Morpho)
8. Option: Execute directly OR create a CoW conditional order (limit order)
9. If direct: flash loan -> deposit collateral -> borrow -> swap -> deposit more collateral
10. If CoW order: creates chunked limit order on-chain via `KapanOrderManager`

### 6.8 LTV Automation (ADL / Auto-Leverage)

File: `modals/LTVAutomationModal.tsx`

1. User clicks settings cog on a protocol header (or position group for Euler)
2. Modal shows two modes: **Auto-Deleverage** (protect from liquidation) and **Auto-Leverage** (maintain leverage)
3. **ADL mode**: Set trigger LTV (e.g., 80%) and target LTV (e.g., 70%). When position reaches trigger, automatically sells collateral to repay debt.
4. **Auto-Leverage mode**: Set trigger LTV and target LTV. When position drops below trigger, automatically borrows more to buy collateral.
5. User selects collateral token and configures chunk count, slippage
6. Creates on-chain conditional order via `KapanOrderManager` with `LtvTrigger` or `AutoLeverageTrigger`

### 6.9 Wallet Swap

File: `modals/WalletSwapModal.tsx` / `WalletSwapModalV2.tsx`

1. User clicks swap icon on a wallet token row (WalletSection)
2. Simple token-to-token swap using 1inch or Kyber
3. No flash loans needed -- direct wallet swap

### 6.10 Euler-Specific Operations

**Add Collateral** (`AddEulerCollateralModal`):
- Shows available vaults not already used as collateral
- Enables new collateral for the controller and deposits tokens

**Borrow** (`EulerBorrowModal`):
- User selects a vault to borrow from
- Requires existing collateral in a sub-account

---

## 7. Hook Return Types by Protocol

### 7.1 Aave-like (`AaveLike` component)

```typescript
// Output via render prop children
{
  suppliedPositions: ProtocolPosition[];  // All tokens with supply balances
  borrowedPositions: ProtocolPosition[];  // All tokens with borrow balances
  forceShowAll: boolean;                  // True when no wallet connected
  hasLoadedOnce: boolean;                 // True after first data load
}
```

**Data source**: On-chain call to `AaveGatewayView.getAllTokensInfo(address)`. Returns per-token: `symbol`, `token`, `balance` (supply), `debt` (borrow), `supplyRate`, `borrowRate`, `price`, `decimals`.

Rate conversion: `aaveRateToAPY(rayRate)` converts Aave's 27-decimal ray rate to percentage APY.

### 7.2 Morpho (`useMorphoLendingPositions`)

```typescript
interface MorphoPositionRow {
  key: string;
  market: MorphoMarket;           // Full market data
  context: MorphoMarketContext;   // Encoded for instructions
  collateralSymbol: string;
  loanSymbol: string;
  collateralBalance: bigint;      // Raw collateral amount
  collateralBalanceUsd: number;
  collateralDecimals: number;
  borrowBalance: bigint;          // Raw borrow amount
  borrowBalanceUsd: number;
  borrowDecimals: number;
  supplyApy: number;
  borrowApy: number;
  lltv: number;                   // Liquidation LTV (0-100)
  currentLtv: number | null;
  healthFactor: number | null;
  isHealthy: boolean;
  hasCollateral: boolean;
  hasDebt: boolean;
}

// Hook return:
{
  markets: MorphoMarket[];
  rows: MorphoPositionRow[];       // User's positions
  isLoadingMarkets: boolean;
  isLoadingPositions: boolean;
  hasLoadedOnce: boolean;
  isUpdating: boolean;
}
```

**Data source**: GraphQL API (Morpho's subgraph) for positions, REST API for markets. On-chain refresh (`useMorphoPositionsRefresh`) for fast updates after transactions.

**Key difference from Aave**: Morpho positions are per-market (each market has one collateral and one loan token). A user can have positions in multiple markets.

### 7.3 Euler (`useEulerLendingPositions`)

```typescript
interface EulerPositionGroupWithBalances {
  subAccount: string;              // Sub-account address
  isMainAccount: boolean;          // Is this the main account (index 0)?
  debt: EulerDebtWithBalance | null; // One debt vault per sub-account
  collaterals: EulerCollateralWithBalance[]; // N collateral vaults
  liquidity: EulerAccountLiquidity | null;   // Health data
}

interface EulerDebtWithBalance {
  vault: EulerVaultInfo;           // Vault metadata (address, asset, APY)
  balance: bigint;                 // Debt balance
}

interface EulerCollateralWithBalance {
  vault: EulerVaultInfo;
  balance: bigint;                 // Collateral balance (underlying assets)
}

interface EulerAccountLiquidity {
  collateralValueLiquidation: bigint;
  collateralValueBorrow: bigint;
  liabilityValue: bigint;
  liquidationHealth: number;
  collateralLtvs: EulerCollateralLtv[];  // Per-collateral LTV configs
  effectiveLltv: number;
  effectiveMaxLtv: number;
  currentLtv: number;
}

// Hook return:
{
  enrichedPositionGroups: EulerPositionGroupWithBalances[];
  hasLoadedOnce: boolean;
  isLoadingPositions: boolean;
  refetchPositions: () => void;
}
```

**Data source**: Euler subgraph (Goldsky) for position discovery, on-chain calls (`balanceOf`, `debtOf`, `maxWithdraw`, `accountLiquidity`) for real-time balances.

**Key differences**: Sub-account grouping, multiple collaterals per debt, on-chain LTV queries per collateral pair.

### 7.4 Vesu (`useVesuLendingPositions`)

```typescript
type VesuPositionRow = {
  key: string;
  supply: ProtocolPosition;
  borrow?: ProtocolPosition;
  isVtoken: boolean;
  collateralSymbol: string;
  debtSymbol?: string;
  collateralAsset: AssetWithRates;
  debtAsset?: AssetWithRates;
  borrowContext: VesuContext;
  hasDebt: boolean;
  ltvPercent?: number | null;
  moveCollaterals?: CollateralWithAmount[];
  poolKey: string;
  protocolKey: VesuProtocolKey;     // "vesu" | "vesu_v2"
};

type AssetWithRates = TokenMetadata & {
  borrowAPR: number;
  supplyAPY: number;
};

// Hook return:
{
  assetsWithRates: AssetWithRates[];
  suppliablePositions: ProtocolPosition[];
  borrowablePositions: ProtocolPosition[];
  rows: VesuPositionRow[];
  isUpdating: boolean;
  hasLoadedOnce: boolean;
  isLoadingPositions: boolean;
  isLoadingAssets: boolean;
  refetchPositions: () => void;
}
```

**Data source**: Starknet contract reads to `VesuGateway.get_all_positions_range()`. Fetches in two batches (0-3 and 3-10 assets) due to Starknet call size limits.

**Key difference**: Starknet uses `bigint` for addresses (felt252), and `TokenMetadata` includes on-chain oracle prices.

### 7.5 Nostra (`useNostraLendingPositions`)

Returns `ProtocolPosition[]` arrays directly (same format as Aave):

```typescript
{
  suppliedPositions: ProtocolPosition[];
  borrowedPositions: ProtocolPosition[];
  isLoading: boolean;
  hasLoadedOnce: boolean;
}
```

**Data source**: `NostraGateway.get_user_positions()` Starknet contract call, combined with `useNostraAssets()` for rates and prices.

### 7.6 Compound (`useCompoundMarketData`)

Returns `MarketData[]` for the markets page. For positions, Compound uses the `AaveLike`-style `ProtocolView` pattern but with compound-specific gateway contracts. The data flow is:

1. `CompoundGatewayView.getCompoundData(baseToken, user)` returns supply rate, borrow rate, balances, price
2. Rates are converted via `compoundRateToAPR(perSecondRate)`
3. Each base token (USDC, WETH, USDT, etc.) is a separate market with its own collateral set

---

## 8. Unified Position Type Analysis

### 8.1 Current State: Three Data Models

The codebase currently has three distinct position data models:

1. **`ProtocolPosition`** (Aave, Compound, Venus, Nostra) -- flat list of supply and borrow positions
2. **`MorphoPositionRow`** (Morpho) -- per-market paired positions (one collateral + one loan per market)
3. **`EulerPositionGroupWithBalances`** (Euler) -- grouped positions (one debt + N collaterals per sub-account)

### 8.2 Common Fields Across All Protocols

Every protocol ultimately needs to display:

| Field | Aave | Morpho | Euler | Vesu | Nostra |
|-------|------|--------|-------|------|--------|
| Token symbol | `name` | `collateralSymbol`/`loanSymbol` | `vault.asset.symbol` | `supply.name` | `name` |
| Token address | `tokenAddress` | `market.collateralAsset.address` | `vault.asset.address` | `supply.tokenAddress` | `tokenAddress` |
| Token decimals | `tokenDecimals` | `collateralDecimals`/`borrowDecimals` | `vault.asset.decimals` | `supply.tokenDecimals` | `tokenDecimals` |
| Raw balance | `tokenBalance` | `collateralBalance`/`borrowBalance` | `balance` | `supply.tokenBalance` | `tokenBalance` |
| USD balance | `balance` | `collateralBalanceUsd`/`borrowBalanceUsd` | computed from price | `supply.balance` | `balance` |
| APY/APR | `currentRate` | `supplyApy`/`borrowApy` | `vault.supplyApy`/`vault.borrowApy` | `supplyAPY`/`borrowAPR` | `currentRate` |
| Token price | `tokenPrice` | `market.*.priceUsd` | fetched separately | from oracle | from oracle |
| LTV/Health | from gateway | `currentLtv`/`lltv` | `liquidity.currentLtv` | `ltvPercent` | N/A |
| Protocol context | `protocolContext` | `context` (encoded) | encoded vault+sub | `vesuContext` | N/A |

### 8.3 Proposed Unified Position Type

```typescript
interface UnifiedPosition {
  // Identity
  id: string;                      // Unique position identifier
  protocol: string;                // "aave" | "morpho" | "euler" | "vesu" | "nostra" | etc.
  networkType: "evm" | "starknet";
  chainId: number;

  // Token info
  tokenSymbol: string;
  tokenAddress: string;
  tokenDecimals: number;
  tokenIcon: string;
  tokenPrice: bigint | null;       // 8 decimal precision

  // Balance
  rawBalance: bigint;              // In token units
  usdBalance: number;              // In USD

  // Rate
  rate: number;                    // APY for supply, APR for borrow (percentage)
  rateType: "apy" | "apr";

  // Position type
  type: "supply" | "borrow";

  // Grouping (for protocols that pair positions)
  groupId?: string;                // Market ID (Morpho), sub-account (Euler), pool ID (Vesu)

  // Risk (optional, for borrow positions)
  currentLtv?: number;             // 0-100 percentage
  maxLtv?: number;
  liquidationLtv?: number;
  healthFactor?: number;

  // Protocol context (opaque, for instruction building)
  context: unknown;

  // Actions available
  availableActions: {
    deposit: boolean;
    withdraw: boolean;
    borrow: boolean;
    repay: boolean;
    move: boolean;
    swap: boolean;
    close: boolean;
    loop: boolean;
    adl: boolean;
  };

  // Associated positions (for grouped display)
  relatedCollaterals?: UnifiedPosition[];  // For borrow positions
  relatedDebt?: UnifiedPosition;           // For supply positions in a market
}
```

### 8.4 Key Challenges for Unification

1. **Grouping models differ**: Aave is flat (any collateral backs any debt), Morpho is 1:1 (one collateral per market), Euler is 1:N (one debt + N collaterals per sub-account). A unified type must handle all three.

2. **Context encoding differs**: Each protocol needs different data to build transactions. Aave needs nothing special, Morpho needs `MarketParams`, Euler needs `(borrowVault, collateralVault, subAccountIndex)`, Vesu needs `VesuContext` objects.

3. **Rate semantics differ**: Supply positions use APY, borrow positions use APR. Some protocols quote both, some only APR.

4. **External yields**: PT tokens (Pendle), LSTs (wstETH, rETH), and Maple syrup tokens have external yield sources that modify the displayed rate. This is handled by `useExternalYields` and is applied at the display layer.

5. **Starknet vs EVM**: Different wallet libraries, different address formats (felt252 vs hex), different modal components.

---

## 9. API Routes

### 9.1 Protocol Data APIs

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /api/morpho/[chainId]/positions?address=` | GET | Fetch Morpho user positions from GraphQL |
| `GET /api/morpho/[chainId]/positions-onchain?address=` | GET | Fetch Morpho positions from on-chain |
| `GET /api/morpho/[chainId]/markets` | GET | Fetch Morpho market data |
| `GET /api/euler/[chainId]/positions?address=` | GET | Fetch Euler positions from subgraph |
| `GET /api/euler/[chainId]/vaults` | GET | Fetch Euler vault data |

### 9.2 Swap/Quote APIs

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /api/1inch/[chainId]/quote` | GET | Get 1inch swap quote |
| `GET /api/1inch/[chainId]/swap` | GET | Get 1inch swap calldata |
| `GET /api/1inch/[chainId]/tokens` | GET | Get 1inch supported tokens |
| `GET /api/kyber/[chainId]/quote` | GET | Get KyberSwap quote |
| `GET /api/kyber/[chainId]/swap` | GET | Get KyberSwap calldata |
| `GET /api/cow/[chainId]/quote` | GET | Get CoW Protocol quote |
| `GET /api/cow/[chainId]/orders` | GET | Get CoW Protocol orders |
| `GET /api/cow/[chainId]/app-data` | POST | Upload CoW app data |
| `GET /api/pendle/[chainId]/markets` | GET | Pendle market data |
| `GET /api/pendle/[chainId]/convert` | GET | Pendle token conversion |

### 9.3 Price APIs

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /api/price` | GET | Token price from Chainlink/other oracles |
| `GET /api/tokenPrice` | GET | Token price lookup |

### 9.4 Order APIs

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /api/orders` | GET | List orders for user |
| `GET /api/orders/[uid]` | GET | Get specific order |
| `POST /api/orders/sync` | POST | Sync order status |
| `POST /api/webhooks/order-fill` | POST | Webhook for CoW order fills |

### 9.5 Referral APIs

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /api/referral/code` | GET | Get referral code |
| `POST /api/referral/register` | POST | Register referral |
| `POST /api/referral/validate` | POST | Validate referral code |
| `GET /api/referral/stats` | GET | Get referral statistics |

---

## 10. Network Coverage Matrix

### 10.1 Protocol x Chain Support

| Protocol | Ethereum | Arbitrum | Base | Optimism | Linea | Unichain | Plasma | Starknet |
|----------|----------|----------|------|----------|-------|----------|--------|----------|
| Aave V3 | Yes | Yes | Yes | Yes | Yes | -- | Yes | -- |
| Compound V3 | Yes | Yes | Yes | Yes | Yes | Yes | -- | -- |
| Venus | -- | Yes | Yes | -- | -- | Yes | -- | -- |
| Morpho Blue | Yes | Yes | Yes | Yes | -- | Yes | -- | -- |
| Euler V2 | Yes | Yes | Yes | Yes | Yes | Yes | Yes | -- |
| Spark | Yes | -- | -- | -- | -- | -- | -- | -- |
| ZeroLend | -- | -- | Yes | -- | Yes | -- | -- | -- |
| Vesu | -- | -- | -- | -- | -- | -- | -- | Yes |
| Nostra | -- | -- | -- | -- | -- | -- | -- | Yes |

### 10.2 Feature x Protocol Matrix

| Feature | Aave | Compound | Venus | Morpho | Euler | Spark | ZeroLend | Vesu | Nostra |
|---------|------|----------|-------|--------|-------|-------|----------|------|--------|
| Deposit | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Withdraw | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Borrow | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Repay | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Move Debt | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Move Supply | Y | Y | Y | Y | Y | Y | Y | -- | -- |
| Collateral Swap | Y* | Y* | Y* | Y | Y | Y* | Y* | -- | -- |
| Debt Swap | Y* | Y* | Y* | Y | Y | Y* | Y* | -- | -- |
| Close Position | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Loop/Multiply | Y | -- | -- | Y | -- | Y | Y | -- | -- |
| E-Mode | Y | -- | -- | -- | -- | Y | Y | -- | -- |
| ADL/Auto-Leverage | Y | Y | Y | Y | Y | -- | -- | -- | -- |
| Markets Browser | Y | Y | Y | Y | Y | -- | -- | Y | Y |

`*` = configurable via `enabledFeatures` prop; `Y` = always available; `--` = not supported

### 10.3 Swap Router Support by Chain

Swap routers are chain-dependent, determined by utility functions in `utils/chainFeatures.ts`:

| Feature | Ethereum | Arbitrum | Base | Optimism | Linea |
|---------|----------|----------|------|----------|-------|
| 1inch | Yes | Yes | Yes | Yes | Yes |
| KyberSwap | Yes | Yes | Yes | Yes | Yes |
| CoW Protocol | Yes | Yes | Yes | -- | -- |
| Pendle | Yes | Yes | Yes | -- | -- |

### 10.4 Flash Loan Provider Support

| Provider | Description |
|----------|-------------|
| Balancer V2 | Legacy flash loans; available on most chains |
| Balancer V3 | Newer flash loans; available on some chains |
| Aave V3 | Aave's native flash loans |
| ZeroLend | ZeroLend flash loans (Base, Linea) |
| Uniswap V3 | Flash swaps via Uniswap |
| Morpho | Morpho flash loans |

The system automatically selects the provider with the lowest cost and sufficient liquidity via `useFlashLoanSelection` and `useFlashLoanLiquidity`.

---

## Appendix A: File Index (Key Files)

### Pages
- `/workspaces/kapan/packages/nextjs/app/page.tsx` -- Landing
- `/workspaces/kapan/packages/nextjs/app/app/page.tsx` -- Main dashboard
- `/workspaces/kapan/packages/nextjs/app/markets/page.tsx` -- Markets
- `/workspaces/kapan/packages/nextjs/app/orders/page.tsx` -- Orders list
- `/workspaces/kapan/packages/nextjs/app/orders/[orderHash]/page.tsx` -- Order detail

### Protocol Views
- `/workspaces/kapan/packages/nextjs/components/specific/common/AaveForkProtocolView.tsx` -- Shared Aave-fork view
- `/workspaces/kapan/packages/nextjs/components/specific/aave/AaveLike.tsx` -- Aave data fetcher
- `/workspaces/kapan/packages/nextjs/components/specific/morpho/MorphoProtocolView.tsx` -- Morpho view
- `/workspaces/kapan/packages/nextjs/components/specific/euler/EulerProtocolView.tsx` -- Euler view
- `/workspaces/kapan/packages/nextjs/components/specific/vesu/VesuProtocolView.tsx` -- Vesu view
- `/workspaces/kapan/packages/nextjs/components/specific/nostra/NostraProtocolView.tsx` -- Nostra view

### Core Components
- `/workspaces/kapan/packages/nextjs/components/ProtocolView.tsx` -- Generic protocol display + ProtocolPosition type
- `/workspaces/kapan/packages/nextjs/components/SupplyPosition.tsx` -- Supply position row
- `/workspaces/kapan/packages/nextjs/components/BorrowPosition.tsx` -- Borrow position row
- `/workspaces/kapan/packages/nextjs/components/common/BasePosition.tsx` -- Base position component
- `/workspaces/kapan/packages/nextjs/components/NetworkFilter.tsx` -- Network selector

### Key Hooks
- `/workspaces/kapan/packages/nextjs/hooks/useMorphoLendingPositions.ts` -- Morpho positions
- `/workspaces/kapan/packages/nextjs/hooks/useEulerLendingPositions.ts` -- Euler positions
- `/workspaces/kapan/packages/nextjs/hooks/useVesuLendingPositions.ts` -- Vesu positions
- `/workspaces/kapan/packages/nextjs/hooks/useNostraLendingPositions.ts` -- Nostra positions
- `/workspaces/kapan/packages/nextjs/hooks/useVesuAssets.ts` -- Vesu asset data
- `/workspaces/kapan/packages/nextjs/hooks/useExternalYields.ts` -- External yield sources
- `/workspaces/kapan/packages/nextjs/hooks/useOptimalRate.ts` -- Best rate finder
- `/workspaces/kapan/packages/nextjs/hooks/useConditionalOrders.ts` -- ADL/leverage orders
- `/workspaces/kapan/packages/nextjs/hooks/useFlashLoanSelection.ts` -- Flash loan provider selection

### Modals
- `/workspaces/kapan/packages/nextjs/components/modals/DepositModal.tsx`
- `/workspaces/kapan/packages/nextjs/components/modals/WithdrawModal.tsx`
- `/workspaces/kapan/packages/nextjs/components/modals/BorrowModal.tsx`
- `/workspaces/kapan/packages/nextjs/components/modals/RepayModal.tsx`
- `/workspaces/kapan/packages/nextjs/components/modals/RefinanceModal.tsx` -- Move debt (dispatches to EVM/Stark)
- `/workspaces/kapan/packages/nextjs/components/modals/MoveSupplyModal.tsx` -- Move supply
- `/workspaces/kapan/packages/nextjs/components/modals/CollateralSwapModal.tsx` -- Collateral swap (V2)
- `/workspaces/kapan/packages/nextjs/components/modals/DebtSwapEvmModal.tsx` -- Debt swap (V2)
- `/workspaces/kapan/packages/nextjs/components/modals/CloseWithCollateralEvmModal.tsx` -- Close position (V2)
- `/workspaces/kapan/packages/nextjs/components/modals/MultiplyEvmModal.tsx` -- Leverage/loop
- `/workspaces/kapan/packages/nextjs/components/modals/LTVAutomationModal.tsx` -- ADL/Auto-leverage
- `/workspaces/kapan/packages/nextjs/components/modals/SwapModalShell.tsx` -- Unified swap shell

### State
- `/workspaces/kapan/packages/nextjs/services/store/store.ts` -- Zustand global store

---

## 11. Markets Page Redesign (Planned)

### 11.1 Current Limitations

The markets page (`/markets`) currently displays rates from **Aave, Compound, Venus, Vesu, and Nostra** but is missing **Euler** and **Morpho**. It also doesn't cover all networks each protocol is deployed on.

Key gaps:
- **Euler V2**: Not shown. Data available via Goldsky subgraph (`/api/euler/[chainId]/vaults`, 60s revalidation).
- **Morpho Blue**: Not shown. Data available via Morpho GraphQL API (`/api/morpho/[chainId]/markets`, 60-120s revalidation).
- **Design**: Needs improvement — the grid/list toggle and token/protocol grouping are functional but not polished.

### 11.2 The Isolated Markets Challenge

Aave, Compound, and Venus have **shared pools** — one supply/borrow rate per token per protocol. Easy to display in a comparison table.

Euler and Morpho have **isolated markets**:
- **Euler V2**: Multiple ERC-4626 vaults per underlying token (e.g., eWETH-1, eWETH-2), each with independent rates and different accepted collateral sets.
- **Morpho Blue**: Each market is a unique loan/collateral pair with its own rate, LTV, and liquidity.

This means a single token like WETH might have 3 Euler vaults and 8 Morpho markets, each with different APYs.

### 11.3 Proposed UX: APY Ranges with Expandable Detail

Display isolated market protocols as **APY ranges** in the comparison table, with a dropdown to expand individual markets:

```
Token    | Aave   | Compound | Venus  | Euler        | Morpho
─────────┼────────┼──────────┼────────┼──────────────┼──────────────
WETH     | 2.1%   | 1.8%     | 2.3%   | 1.5–3.2% ▼  | 0.8–4.1% ▼
USDC     | 4.5%   | 5.1%     | 4.8%   | 3.2–6.1% ▼  | 2.9–7.3% ▼
```

Clicking the range expands to show individual vaults/markets:

```
Euler WETH vaults:
├─ eWETH-1  2.1% borrow  (collateral: USDC, WSTETH)  $12M liquidity
├─ eWETH-2  1.5% borrow  (collateral: USDC only)      $4M liquidity
└─ eWETH-3  3.2% borrow  (collateral: weETH, WSTETH)  $800K liquidity

Morpho WETH markets:
├─ WETH/USDC   0.8% borrow  LTV 86%  $25M liquidity
├─ WETH/wstETH 2.1% borrow  LTV 94%  $8M liquidity
└─ WETH/weETH  4.1% borrow  LTV 90%  $1.2M liquidity
```

### 11.4 Caching Architecture: Supabase-Backed Rate Cache

**Problem**: Vercel is serverless — no in-memory cache persists across invocations. Current Next.js ISR caching (60-120s revalidation on `fetch`) works but still hits external APIs on cache miss, which can be slow and unreliable.

**Solution**: Use Supabase as a persistent rate cache, populated by a background job.

#### Data Flow

```
┌──────────────────────────────────────────────────────┐
│  Background Job (Vercel Cron or Supabase pg_cron)    │
│  Runs every 2-5 minutes                              │
│                                                      │
│  ┌─────────┐  ┌─────────┐  ┌───────┐  ┌──────────┐  │
│  │ Goldsky  │  │ Morpho  │  │ RPC   │  │ Starknet │  │
│  │ (Euler)  │  │ GraphQL │  │(Aave, │  │ (Vesu,   │  │
│  │          │  │         │  │ Comp,  │  │  Nostra) │  │
│  │          │  │         │  │ Venus) │  │          │  │
│  └────┬─────┘  └────┬────┘  └───┬───┘  └────┬─────┘  │
│       └──────────────┴──────────┴────────────┘        │
│                      │                                │
│              ┌───────▼───────┐                        │
│              │   Supabase    │                        │
│              │  market_rates │                        │
│              └───────────────┘                        │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  Markets Page (client)                               │
│                                                      │
│  Single Supabase query → all rates, all chains       │
│  No external API calls at render time                │
│  Stale data (up to 5 min) is fine for rate display   │
└──────────────────────────────────────────────────────┘
```

#### Supabase Table Schema

```sql
create table market_rates (
  id             bigserial primary key,
  chain_id       int not null,
  protocol       text not null,         -- 'aave', 'compound', 'venus', 'euler', 'morpho', 'vesu', 'nostra'
  token_symbol   text not null,         -- underlying token symbol (e.g., 'WETH')
  token_address  text not null,         -- underlying token address
  supply_apy     numeric,              -- supply APY as percentage
  borrow_apy     numeric,              -- borrow APY as percentage
  liquidity_usd  numeric,              -- available liquidity in USD
  -- isolated market fields (null for shared pools):
  market_id      text,                 -- vault address (Euler) or uniqueKey (Morpho)
  market_label   text,                 -- e.g., 'eWETH-1' or 'WETH/USDC'
  collaterals    jsonb,                -- [{symbol, address, ltv}]
  ltv            numeric,              -- max LTV (for Morpho pair markets)
  updated_at     timestamptz not null default now()
);

-- Index for fast page queries
create index idx_market_rates_lookup on market_rates (chain_id, protocol, token_symbol);

-- Index for cleanup
create index idx_market_rates_updated on market_rates (updated_at);
```

#### Background Job (Vercel Cron)

Create `/api/cron/refresh-rates` (protected by `CRON_SECRET`):

```
vercel.json:
{
  "crons": [{
    "path": "/api/cron/refresh-rates",
    "schedule": "*/3 * * * *"
  }]
}
```

The job would:
1. Fetch rates from all sources in parallel (reuse existing API route logic)
2. Upsert into `market_rates` (keyed on `chain_id + protocol + token_address + market_id`)
3. Delete rows with `updated_at` older than 15 minutes (stale cleanup)

#### Pre-Aggregated Ranges

For the "by token" view, the client can compute min/max APY per token from the Supabase response, or a Supabase view could pre-aggregate:

```sql
create view market_rate_ranges as
select
  chain_id,
  protocol,
  token_symbol,
  token_address,
  min(supply_apy) as supply_apy_min,
  max(supply_apy) as supply_apy_max,
  min(borrow_apy) as borrow_apy_min,
  max(borrow_apy) as borrow_apy_max,
  sum(liquidity_usd) as total_liquidity_usd,
  count(*) as market_count
from market_rates
group by chain_id, protocol, token_symbol, token_address;
```

### 11.5 Implementation Phases

**Phase 1 — Quick win (no infra change):**
Add Euler and Morpho to the existing "by protocol" market view. The API routes already exist; just wire in new lazy-loaded components like the existing `AaveMarkets`, `CompoundMarkets`, etc.

**Phase 2 — Supabase cache:**
Set up `market_rates` table, write the cron job to populate it, migrate the markets page to read from Supabase instead of direct API calls.

**Phase 3 — Redesigned "by token" view:**
Build the APY range display with expandable isolated market detail. This is where the collateral info, LTV, and liquidity columns become important.

### 11.6 Existing Infrastructure to Reuse

| Piece | Location | Notes |
|-------|----------|-------|
| Euler vault fetch + filtering | `app/api/euler/[chainId]/vaults/route.ts` | Returns `EulerVaultResponse[]` with collaterals, APY, utilization |
| Morpho market fetch + quality filtering | `app/api/morpho/[chainId]/markets/route.ts` | Returns `MorphoMarket[]` with loan/collateral pairs, state |
| Aave/Compound/Venus rate conversion | `hooks/useAllProtocolRates.ts` | `aaveRateToAPY()`, `compoundRateToAPR()`, `venusRateToAPY()` |
| Rate aggregation & optimal rate lookup | `hooks/useAllProtocolRates.ts` | `getRate()`, `getOptimalRate()` — already builds `Map<Address, Map<Protocol, TokenRate>>` |
| Lazy market components | `app/markets/MarketsPageContent.tsx` | Uses `dynamic()` imports for bundle splitting |
| Network filter | `components/NetworkFilter.tsx` | Already supports multi-network selection |

---
name: lending-instructions
description: Load when working with KapanRouter instructions, UTXO tracking, flash loan flows, or debugging transaction failures
---

# Kapan Lending Instructions System

The KapanRouter uses a **UTXO-based instruction system** where each operation can consume inputs from previous outputs and produce new outputs. Understanding this is critical for building correct flows.

## Core Concepts

### UTXO (Unspent Transaction Output)
Each instruction can create outputs that subsequent instructions reference by index. The router maintains an `outputs[]` array during execution.

### Two Instruction Types

1. **Router Instructions** (`protocolName: "router"`) - Handled by KapanRouter directly
2. **Protocol Instructions** (`protocolName: "aave"`, `"compound"`, etc.) - Delegated to gateways

## Router Instructions

Defined in `utils/v2/instructionHelpers.ts:4-13`:

| Type | Creates UTXO? | Description |
|------|--------------|-------------|
| `FlashLoan` | **Yes** | Borrows from flash loan provider, creates output for repayment amount |
| `PullToken` | **Yes** | Pulls tokens from user to router and appends amount/token output (requires user approval) |
| `PushToken` | **No** | Sends tokens from UTXO to user |
| `ToOutput` | **Yes** | Creates a UTXO from hardcoded amount/token (no actual transfer) |
| `Approve` | **Yes** (empty) | Approves gateway to spend UTXO. Creates empty output for index sync! |
| `Split` | **Yes** (2) | Splits UTXO into fee portion + remainder (for Aave flash loan fees) |
| `Add` | **Yes** | Combines two UTXOs of same token |
| `Subtract` | **Yes** | Subtracts one UTXO from another |

### Critical: Approve Creates Empty Output
The `Approve` instruction creates an empty output to maintain index synchronization. This is why output indices jump after approvals:
```typescript
// After Approve(2), the next output is index 3, not 2!
addRouter(encodeApprove(2, "aave"), true); // createsUtxo=true
```

## Lending Operations

Defined in `utils/v2/instructionHelpers.ts:26-36`:

| Op | Creates UTXO? | Description |
|----|--------------|-------------|
| `Deposit` | No | Supply tokens to lending protocol |
| `DepositCollateral` | No | Supply as collateral (Morpho, Compound) |
| `WithdrawCollateral` | **Yes** | Withdraw collateral, creates output |
| `Borrow` | **Yes** | Borrow tokens, creates output |
| `Repay` | **Yes** | Repay debt, creates refund output (usually 0) |
| `GetBorrowBalance` | **Yes** | Query debt balance, creates output with amount |
| `GetSupplyBalance` | **Yes** | Query supply balance, creates output with amount |
| `Swap` | **Yes** (2) | Swap via DEX, creates (tokenOut, refund) outputs |
| `SwapExactOut` | **Yes** (2) | Exact output swap, creates (tokenOut, refund) outputs |

## Input Index Conventions

- `inputIndex: 999` - Ignore input, use `amount` parameter directly
- `inputIndex: 0-998` - Read amount/token from `outputs[inputIndex]`

## Flash Loan Providers

```typescript
enum FlashLoanProvider {
  BalancerV2 = 0,  // 0% fee
  BalancerV3 = 1,  // 0% fee  
  Aave = 2,        // ~5-9 bps fee
  ZeroLend = 3,    // ~5 bps fee
  UniswapV3 = 4,   // Requires pool address
  Morpho = 5,      // 0% fee
}
```

**Important**: Aave/ZeroLend flash loans create an output with the **repayment amount** (principal + fee), not the borrowed amount. The router receives the principal but must track repayment separately.

## Common Flows

### Basic Deposit
```typescript
[
  PullToken(amount, token, user),      // No output
  Approve(0, protocol),                // Output[0] = empty (for sync)
  DepositCollateral(token, user, 0, inputIndex=0),  // No output
]
```

### Withdraw Max
```typescript
[
  GetSupplyBalance(token, user),       // Output[0] = balance
  WithdrawCollateral(token, user, inputIndex=0),  // Output[1] = withdrawn
  PushToken(1, user),                  // No output
]
```

### Flash Loan Pattern
```typescript
[
  ToOutput(amount, token),             // Output[0] = virtual UTXO
  FlashLoan(provider, inputIndex=0),   // Output[1] = repayment amount
  // ... use borrowed funds (router has Output[0] worth of tokens)
  // ... must leave Output[1] worth in router for repayment
]
```

### Aave Flash Loan with Fee (Max Withdrawal)
When using Aave flash loans for max operations, use `Split` to account for fees:
```typescript
[
  GetSupplyBalance(token),             // Output[0] = 100
  Split(0, 9),                         // Output[1] = 0.09 (fee buffer), Output[2] = 99.91
  FlashLoan(Aave, 2),                  // Output[3] = 100 (repayment), router has 99.91
  // ... operations using Output[2] (what we actually have)
  // ... withdraw Output[3] worth to repay
]
```

## File Locations

- **Instruction Helpers**: `packages/nextjs/utils/v2/instructionHelpers.ts`
- **Flow Builders**: `packages/nextjs/hooks/useKapanRouterV2.tsx:219-936`
- **Move Builder**: `packages/nextjs/hooks/useKapanRouterV2.tsx:1519-1631`
- **Starknet Instructions**: `packages/nextjs/hooks/useStarknetMovePosition.ts`

## Debugging Tips

1. **Track UTXO indices manually** - Draw out the output array as you build instructions
2. **Approve creates empty output** - Always increment your expected index after Approve
3. **Flash loan outputs** - Remember: Aave Output = repayment (more than borrowed)
4. **Use simulation** - `simulateInstructions()` catches most errors before execution
5. **Check authorization** - `getAuthorizations()` returns needed approvals

## Protocol Context Encoding

Different protocols need different context bytes:

```typescript
// Aave: empty context
context = "0x"

// Compound: market address
context = encodeAbiParameters([{ type: "address" }], [marketAddress])

// Morpho: full MarketParams tuple
context = encodeMorphoContext({ loanToken, collateralToken, oracle, irm, lltv })
```


## Morpho Midnight integration

Use protocol name `morpho-midnight` (distinct from `morpho-blue`). Read
`docs/morpho-midnight-contract-integration.md` before building instructions or quotes.

- Write context is `abi.encode(marketId, collateralIndex, tradeData)`; view context accepts the first two fields.
- `Borrow.amount` is exact **net cash received**. Face debt is larger at a discount and determines health. `Repay` uses face debt.
- Midnight requires gateway authorization for **all** mutations, including supply collateral and repay.
- `Deposit` buys lender credit against offers; it is not collateral supply. `DepositCollateral` supplies collateral. Use index `type(uint256).max` only for reading/redeeming lender credit.
- Offers come from inline `Take[]` or publisher/key execution plans. The user's instruction retains rate, price, maturity/market, debt-unit and deadline bounds across refreshes.
- A fixed offer price is not a fixed APR as maturity approaches. Always set execution-time `maxApr` for deferred borrowing.
- Pure refinancing into Midnight still consumes offers. Direct face-value repayment out of Midnight does not.
- Midnight's oracle values are in loan-token units, not necessarily USD. Health aggregates all collateral slots with their own LLTVs.
- Use the isolated Osaka runner for upstream and deployed-core tests; Kapan contracts still compile with 0.8.30/Cancun.
- Current UTXO behavior is authoritative in `contracts/v2/KapanRouter.sol` and `test/v2/helpers/instructionHelpers.ts` (under `packages/hardhat`). Some older flow examples below/above predate PullToken output creation.

### Midnight frontend

- Read `docs/morpho-midnight-frontend.md`. Group loans under Morpho while retaining `morpho-midnight` execution contexts and a Fixed loan position badge.
- Use `useMidnightFinancing` for executable loan quotes and face-debt health; never apply Blue's cash-debt assumptions. Rebind quotes to market, amount and all collateral slots.
- REST list endpoints cap pages at **20**, not 100; follow cursors. Quote takes have a separate limit of 32. Validate immutable market IDs and deployed core addresses.
- `use1inchQuote.isAmountCurrent` must be true before using its debounced calldata. Select the returned aggregator's gateway, and reject stale quotes.
- New Midnight aggregator builders live in `utils/midnight/flows.ts`; they use zero-fee flash providers and explicit refund outputs. Do not reuse a single collateral slot context for both sides of a collateral swap.
- Read the router gateway registry before enabling transactions. API discovery and position reads must remain useful before gateway deployment.

### Midnight deployment

- Use only the `MorphoMidnightGateway` tag. Its script reuses and preflights the live router/helper, deploys a new view router, copies the live supported view registrations, and enables writes last. Broad deployment dependencies can redeploy unrelated routers or reset providers.
- Existing trigger contracts retain their immutable old view-router address. Updating the frontend view router does not upgrade those triggers or enable Midnight limits.
- Validate frontend builds against `yarn install --immutable`; a separate npm install can introduce incompatible Wagmi/core versions absent from the repository lockfile.

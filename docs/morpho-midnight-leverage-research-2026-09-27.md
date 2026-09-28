# Morpho Midnight: leverage and limit-order integration

Research date: 2026-09-27. Scope: feasibility against current Kapan source and official Morpho/CoW documentation and source. This records the initial design investigation. Subsequent implementation and deployed-core fork results are in [contract integration](./morpho-midnight-contract-integration.md); the UI is in [frontend integration](./morpho-midnight-frontend.md). Repository `main` source alone is not proof of deployed bytecode compatibility.

## Recommendation

Add Midnight as a separate lending protocol. Start with immediate leverage using Kapan's existing flash-loan/aggregator architecture, then direct-repayment close orders. Add long-lived leverage-entry orders only after implementing execution-time offer refresh with user-enforced bounds.

User direction: start with the existing aggregator flow. Callback-native and CoW entry designs remain follow-up options; they are feasible but add execution and liquidity-refresh machinery.

| Capability | Assessment | Principal additional work |
| --- | --- | --- |
| Immediate leverage through 1inch/Kyber/Pendle | Feasible; best first integration | Midnight gateway, offer quotes, unit accounting |
| Direct callback leverage without an external flash loan | Supported by core execution ordering | Dedicated callback executor and swap integration |
| CoW leverage entry | Feasible design; settlement proof required | Midnight borrow in post-hook, live offer execution plan |
| CoW price-limit close/deleverage | Simpler than entry | Direct repay/withdraw gateway, collateral flash liquidity |
| Native Midnight borrowing-rate offers | Native offer mechanism | Signing, publication, cancellation, collateral management |
| Native resting offers that also open leverage | Feasible onchain, distribution unresolved | Custom callback, fill-time routing, router acceptance or own taker |

These are engineering assessments, not guarantees of liquidity or solver participation.

## What Midnight provides

Midnight trades fixed-maturity units: borrowing sells units for loan tokens; the resulting debt is the face amount due, not the cash received. An illustrative net unit price of 0.95 means receiving 10,000 loan tokens creates approximately 10,526.32 units of debt. Kapan must use the latter for health calculations. Early debt closure can buy units on the secondary market; direct repayment pays face value. See [market mechanics](https://docs.morpho.org/developers/midnight/concepts/market-mechanics/).

The relevant callbacks are `onSell`, `onBuy`, `onRepay`, and `onFlashLoan` (plus liquidation). In the core source, `take` updates positions, invokes the buyer callback, transfers loan tokens, invokes the seller callback, then checks seller health. `repay` decreases debt before its callback and collects repayment afterward. This ordering supports temporary liquidity inside one transaction. See [Midnight.sol](https://raw.githubusercontent.com/morpho-org/midnight/main/src/Midnight.sol).

Midnight authorization differs from Blue: `setIsAuthorized` grants broad authority across that deployment, including authorization changes. Even supplying collateral and repaying on behalf of someone require authorization. Gateways must scope what delegated callers can do. Callbacks return `keccak256("morpho.midnight.callbackSuccess")`. See [contract interfaces](https://docs.morpho.org/developers/contracts/midnight/).

## Existing Kapan integration points

The active multiply UI uses `useCowConditionalOrder`, rather than the legacy `useCowLimitOrder` path. Some existing project skill references name old manager contracts; current source is the authority for this investigation.

| Existing code | Reuse or required change |
| --- | --- |
| `packages/nextjs/hooks/kapan-router/useTransactionBuilder.ts:520` | `buildMultiplyFlow`: flash debt → swap → deposit → borrow repayment |
| `packages/nextjs/hooks/use1inchQuote.ts:19` | Existing 1inch/Kyber selection and Pendle fallback |
| `packages/hardhat/contracts/v2/gateways/morpho/MorphoBlueGatewayWrite.sol` | Useful gateway shape; Blue ABI/accounting cannot serve Midnight |
| `packages/nextjs/components/modals/multiplyEvmHelpers.ts:428` | CoW post-hook deposits collateral and borrows flash repayment |
| `packages/nextjs/hooks/useCowConditionalOrder.ts:528` | Encodes pre/post instructions at order creation |
| `packages/hardhat/contracts/v2/cow/KapanConditionalOrderManager.sol:401` | Runs stored instructions; injects actual sell/buy amounts |
| `packages/hardhat/contracts/v2/cow/KapanConditionalOrderHandler.sol:66` | Generates conditional GPv2 orders; ignores dynamic offchain input |
| `packages/hardhat/contracts/v2/cow/KapanCowAdapter.sol` | Existing outer flash loan around CoW settlement |

Use a distinct `morpho-midnight` identity. `getProtocolId` in `useCowConditionalOrder.ts:183` currently maps every name containing `morpho` to Blue. Update protocol normalization, context encoders, collateral-operation selection, view routing, health calculations, and protocol-specific UI branches together.

## Immediate aggregator leverage

A market borrow does not publish the borrower's resting offer. Lenders have already made signed buy-unit offers. Kapan requests a borrow quote (bids), receives executable offers and ratifier data, and includes `take` calls in the user's transaction. The user is the taker/borrower; an authorized gateway submits those calls on their behalf. A native limit-rate borrow instead publishes the user's sell-unit offer and waits for a counterparty. This maker/taker distinction is separate from the aggregator's collateral-token swap.

The smallest architectural change preserves Kapan's existing flow:

1. Pull/deposit the user's collateral margin.
2. Flash-borrow loan tokens from an existing supported provider.
3. Swap through the selected existing aggregator adapter.
4. Deposit purchased collateral into Midnight for the user.
5. Take lender bids, receiving enough loan tokens to cover flash principal and fees.
6. Repay the flash loan and return residual tokens.

The new borrow operation needs executable offers and ratifier data, rather than Blue's pool borrow call. The Morpho REST quote endpoint returns offer plans with fallback excess. Execution must cap total units and assets, handle exhausted offers, and require the requested net proceeds; it must not fill every returned fallback offer. The API is version `v0`. See [Midnight API](https://docs.morpho.org/developers/api/morpho-midnight/).

Keep swap-price protection separate from financing protection: minimum collateral output, maximum new face debt, acceptable maturity, and minimum final health must all pass. For a rate limit, calculate the effective rate at execution; the same unit price implies a different annualized rate as maturity approaches. Use the [Morpho SDK's Midnight math and transaction primitives](https://docs.morpho.org/developers/sdks/morpho-sdk/midnight/) where compatible, with a pinned version.

A second design takes a bid with Kapan as taker callback: receive loan tokens → swap → supply collateral → return from `onSell`. This can remove the external flash loan. It needs a dedicated executor or authenticated router continuation: calling `processProtocolInstructions` recursively will hit the router's `nonReentrant` guard. Budget execution and collateral coverage across multiple fills, not just one ideal offer.

## CoW leverage and long-lived entry orders

The proposed settlement topology is:

```text
outer flash loan of loan token
  → fund Kapan order manager
  → CoW swaps loan token into collateral at the user's limit
  → post-hook deposits margin + purchased collateral
  → Midnight takes lender bids to obtain flash repayment
  → repay outer flash loan
```

A Midnight callback cannot remain open between a CoW pre-hook and post-hook: each hook call returns before settlement advances. Nesting the entire CoW settlement inside a callback would require a different solver/borrower integration. Reusing Kapan's outer flash-loan mechanism is the practical first design. CoW's [flash-loan router](https://github.com/cowprotocol/flash-loan-router) is built to wrap settlement this way.

The missing component is fresh financing liquidity. Kapan stores instruction bytes at creation; Midnight offers can expire, lose funding, be cancelled, or be consumed while a price-limit order waits. Embedding today's quote for a week-long order is therefore unreliable. CoW does not automatically discover Midnight lenders for Kapan's post-hook.

Recommended extension: store the user's constraints separately from a replaceable execution plan. A keeper fetches fresh Midnight offers and publishes an order/iteration-bound plan to an executor or plan registry. The stored hook references that plan; onchain validation enforces the user's market, maturity, maximum face debt/rate, proceeds, collateral, recipient, expiry and nonce constraints. The keeper may select liquidity but must not gain arbitrary transaction authority. A registry could preserve the manager ABI; passing fresh calldata directly would require hook/manager and solver changes. Both approaches require separate implementation and review.

For a proof of concept, short-lived orders with recently fetched offers and explicit cancellation/recreation are acceptable. They are not a reliable long-lived order product. Each chunk needs its own financing plan and remaining-budget accounting.

CoW hooks are not intrinsically mandatory or revert-propagating. Pre-hooks run before signatures and post-hooks after proceeds arrive; partial-fill pre-hooks execute only on the first fill. Keep each execution fill-or-kill, as the current conditional handler already does. Ensure missing/failed critical hooks prevent the enclosing transaction from completing, using flash repayment and explicit completion/balance invariants. Existing dust must not accidentally fund a failed operation. See [CoW hooks specification](https://docs.cow.fi/cow-protocol/reference/core/intents/hooks).

## Limit orders: entry, exit, and borrowing rate

**Collateral-price entry:** “Open leverage when ETH costs at most X, provided borrowing costs at most Y.” Feasible with either a keeper executing the aggregator flow or CoW filling the swap. Both need a fresh Midnight financing plan and enforcement of both limits. An aggregator quote alone is not an autonomous resting order service.

**Close / take profit / deleverage:** direct repayment avoids lender-offer discovery. Kapan's existing close helper already uses collateral flash funding: flash collateral → CoW sells collateral for loan tokens → repay debt → withdraw collateral to restore the flash loan. Adapt it to Midnight's face-debt units, user authorization, live remaining debt and health checks. This depends on flash liquidity for the collateral token. An aggregator alternative can flash loan tokens or use `onRepay` to withdraw and sell collateral inside repayment. A discounted secondary exit needs fresh offers again.

**Borrowing-rate offers:** Midnight supports resting signed offers, partial consumption and shared group budgets. A borrower can publish a sell-unit offer; a callback can turn the proceeds into more collateral. However, fixed-price offers are not automatically constant-APR commitments. Offer expiry, rate-at-fill protection, per-fill margin allocation, cancellation and zero-sized/no-op fills need explicit treatment.

**Distribution constraint:** Morpho's router applies callback policies. Its documented recognized callback is the registered Blue-buy funding callback; arbitrary Kapan leverage callbacks must not be assumed indexable. Use the validation endpoint and confirm acceptance with Morpho, or operate a taker/router. This primarily concerns custom maker offers; consuming supported lender offers with our own taker callback is a separate path. See [callback documentation](https://docs.morpho.org/developers/midnight/concepts/callbacks/) and [router validation rules](https://docs.morpho.org/developers/midnight/concepts/mempool-router/).

## Implementation scope and acceptance checks

1. **Gateway and reads:** separate write/view gateways, market plus collateral-index context, authorizations, debt/health views, direct repay and withdraw. Pin the deployed ABI and source revision.
2. **Quotes and immediate leverage:** REST/SDK integration, bounded multi-offer borrow, aggregator flow, financing-aware sizing, simulation and explicit slippage/rate/debt limits.
3. **Close orders:** adapt current CoW settlement plumbing and trigger/UI configuration; prove success and rollback with real settlement contracts.
4. **Entry limit orders:** scoped plan executor/registry, keeper refresh, cancellation and per-chunk lifecycle, solver simulation and end-to-end fills.
5. **Optional callback-native offers:** executor plus distribution agreement or owned taker infrastructure; avoid persisting expiring aggregator calldata in resting offers.

Required tests include consumed/expired offers, insufficient financing proceeds, rounding, changed fees, adverse swaps, partial chunks, zero fills, callback impersonation/replay, wrong market/recipient, authorization revocation, failed/omitted CoW hooks, flash repayment shortfalls, and maturity crossing. Maturity is a real execution boundary: unpaid debt becomes liquidatable after maturity even if collateral remains sufficient. Product support needs explicit repayment/rollover handling; rollover depends on new liquidity. See [health and liquidation rules](https://docs.morpho.org/developers/midnight/concepts/collateral-health-liquidations/).

## Verification limits

Official addresses list Midnight deployments including Ethereum and Base; the documented REST API lists those two chains. Confirm overlap with Kapan's deployed gateways, CoW flash support, live market maturity and actual depth before selecting a launch market. Example addresses in docs are not deployment configuration; use the [canonical address registry](https://docs.morpho.org/developers/contracts/addresses/).

Contract implementation and validation now supersede the original research-only status. See [contract integration and test instructions](./morpho-midnight-contract-integration.md). No live transactions were submitted. The Base fork validates deployed Midnight, SetterRatifier, Blue and real tokens. A live API quote for 0.1 WETH on market `0xcdea4ca06837feca3026b23a95f0bd96c3eabdc77d1211472ce0346fcc200649` returned `422 INSUFFICIENT_LIQUIDITY`, so deterministic matching tests ratify funded offers locally on the fork. These tests do not establish live executable depth or production solver participation.

Neither a callable beads tool nor a `beads`/`bd` executable was available, so task tracking could not be updated through the required tool.

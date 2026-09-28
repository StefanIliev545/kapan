# Morpho Midnight frontend

Fixed loans are displayed alongside Blue positions in the **Morpho** group. Each fixed-loan card has a **Fixed loan** header badge, maturity with UTC time, face debt, indexed entry APR when available, per-token collateral balances and onchain health. The execution protocol remains `morpho-midnight`.

## Position discovery and accounting

`hooks/midnight/useMidnight.ts` combines Morpho's indexed positions (including matured markets) with pinned-block reads of debt, collateral slots and market oracles. Locally remembered market IDs let a newly opened position appear before the indexer catches up. No synthetic debt or token decimals are used. API failures are shown separately from an empty portfolio.

Fixed collateral and face debt contribute to Morpho's portfolio totals. Fixed interest is already included in face debt, so projected yield does not charge that interest again. External collateral yields still contribute. Missing indexed entry APR is displayed as unavailable.

## Refinance and market execution

The existing refinance form offers **Morpho Midnight** on Ethereum and Base. It discovers markets for the same debt token, requires every selected collateral to be accepted, and excludes matured, nearly matured and gated markets. A fixed loan can roll into another compatible Midnight market; the source market is excluded.

The user selects a maturity and maximum APR. Quotes show net cash, expected face debt, maximum new debt, available lender liquidity and health using the maximum debt. Every change of amount, collateral or market rebinds the quote and risk query. The builder respects partial debt sizing; max refinance continues reading the live source debt. Each moved collateral uses its own source/destination slot context.

Market borrowing takes existing lender bids; it does not publish a resting borrower order. Inline takes include ratifier proofs. Quotes expire after 60 seconds for submission, carry a short execution deadline, and enforce price, APR, debt-unit and health bounds in the gateway. The preview mirrors TickLib, maker-group consumption and settlement-fee deductions. Onchain simulation/execution remains authoritative for funding and ratification changes.

## Actions

- Add/withdraw collateral and repay face debt, including after maturity.
- Borrow and increase leverage using the existing best aggregator quote path.
- Repay with collateral, returning surplus to the wallet.
- Swap collateral between supported slots of the same market.
- Switch fixed debt into another compatible Midnight market, repaying the old loan and moving its collateral atomically.
- Refinance to/from other supported protocols and roll fixed loans between markets.

New swap flows use available zero-fee flash providers. They bind calldata to the debounced amount, token pair and quote age. They preserve UTXO indices and distinguish collateral deposit from buying lender credit. The shared wallet execution hook uses the selected chain and awaits network switching.

The UI checks the router's `gateways("morpho-midnight")` registry. Discovery is available before deployment, but transaction submission is disabled until the gateway is registered. This change does not deploy contracts or send live transactions.

Limit orders, automatic rollovers, lender-credit management and CoW settlement are not exposed in this UI. Deferred borrowing still needs an execution-time offer refresh service and its user-enforced bounds; a pure refinance into Midnight also consumes lender offers. See [contract integration](./morpho-midnight-contract-integration.md).

## Data and validation

The public same-origin proxy is `/api/midnight/{chainId}/{markets|positions|quote}`. It uses [Morpho's official API](https://docs.morpho.org/developers/api/morpho-midnight/), validates market IDs against immutable parameters and known Midnight deployments, and follows cursors with 20-item list pages. Quote requests allow up to 32 takes. RPC reads use `BASE_RPC_URL` / `ETHEREUM_RPC_URL` when configured, otherwise viem's chain defaults. Errors do not return private RPC URLs.

Validation on 2026-09-27:

- 35 focused Vitest tests: live API fixture identity/tick parity, quote/fee/APR/cap checks, stale amount and collateral invalidation, gateway/health gating, shared builders, swap output indices, API pagination and error handling, and fixed-loan card states.
- Live local API checks returned 202 Base USDC markets, a four-offer executable quote and three indexed positions for a public maker address. These are time-specific observations, not guaranteed liquidity.
- Browser inspection of the actual fixed-loan card and terms components with the repository's styles and an explicitly labelled sample position; no wallet transaction was submitted.
- The initial isolated install showed Wagmi/core version conflicts. Reinstalling the repository with `yarn install --immutable` resolved those conflicts without source or lockfile changes.
- Contract-side deployed-core fork coverage is documented separately in the contract integration notes.

Run the frontend checks from `packages/nextjs`:

```sh
node node_modules/vitest/vitest.mjs run utils/midnight/__tests__ hooks/midnight/__tests__ components/specific/morpho/midnight/__tests__
```

Validation on 2026-09-28:

- Production `yarn build` completed, including TypeScript checks (`NEXT_PUBLIC_IGNORE_BUILD_ERROR=false`) and all 39 static pages, using the locked Next 16.1.6 dependencies.
- This checkout lacks a database URL. For build validation only, `DATABASE_URL=postgresql://build:build@127.0.0.1:1/build` satisfied the existing database module's import-time configuration check. No database was accessed; production still requires its real database configuration. Existing Venus rate fetches emitted handled reverts during prerendering.
- All 35 Midnight frontend tests passed again; full frontend lint passed with zero errors (574 existing warnings).
- The complete UI test suite is not green: 150 passed, 37 failed, 4 skipped, with two additional suite-load failures. Failures are in unchanged scaffold/Starknet tests and live Pendle network tests, outside the Midnight integration.

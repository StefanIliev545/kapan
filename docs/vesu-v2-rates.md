# Vesu V2 Lending Rates

This note summarises how the Vesu V2 interest model works and how the Kapan app derives human readable lending rates from the on-chain data exposed by the `VesuGatewayV2` contract.

## On-chain metrics exposed by `VesuGatewayV2`

`VesuGatewayV2` mirrors the Cairo structs exposed by the Vesu pool and forwards them to the frontend. Each entry returned by `get_supported_assets_ui` contains:

- `fee_rate`: the instantaneous borrow interest rate per second, scaled by `1e18` (referred to as `SCALE`).
- `total_nominal_debt` and `last_rate_accumulator`: the nominal debt outstanding and the latest rate accumulator that converts nominal debt into real debt.
- `reserve`: the unused liquidity in the pool for the asset.
- `scale`: the token specific scaling factor used by Vesu (typically `1e18`).
- `utilization`: the pool utilisation reported by Vesu (also scaled by `1e18`).

All of these fields are defined in the on-chain `TokenMetadata` struct that the gateway serialises for the UI layer.【F:packages/snfoundry/contracts/src/gateways/VesuGatewayV2.cairo†L1-L66】

## Frontend rate helpers

The Next.js frontend exposes utility helpers under `packages/nextjs/utils/protocols.ts` that implement the same conversions that Vesu's own interface performs:

- `toAPR(fee_rate)` multiplies the per-second rate by the number of seconds per year (31,536,000) and divides by `SCALE`, giving a simple borrow APR fraction (e.g. `0.05` for 5%).
- `toAPY(fee_rate)` compounds the per-second rate across the year, i.e. `(1 + fee_rate / SCALE)^{secondsPerYear} - 1`, yielding the annualised borrow rate with continuous compounding.
- `toAnnualRates(...)` combines the raw gateway fields to return `{ borrowAPR, supplyAPY }`. It converts nominal debt into real debt using `last_rate_accumulator`, adds the reserve (normalised via `scale`), and multiplies the compounded annual rate by the utilisation ratio to obtain the supply APY that suppliers actually earn.【F:packages/nextjs/utils/protocols.ts†L1-L43】

These helpers are reused everywhere the app needs to present lending rates, including the hooks that prepare Vesu asset data for the UI.【F:packages/nextjs/hooks/useVesuAssets.ts†L94-L141】【F:packages/nextjs/hooks/useVesuV2Assets.ts†L90-L149】

## Rate calculation workflow in the app

For each asset returned by the gateway the frontend performs the following steps:

1. **Normalise raw data** – `parseSupportedAssets` converts the Cairo array into `TokenMetadata` objects with JavaScript friendly types (BigInt for numeric fields).【F:packages/nextjs/hooks/useVesuAssets.ts†L28-L91】
2. **Compute borrower APR** – `toAPR` translates the per-second `fee_rate` into an annualised simple rate by multiplying by the seconds per year constant.
3. **Compute utilisation** – The helper multiplies `total_nominal_debt` by `last_rate_accumulator / SCALE` to get the current borrowed amount, and combines it with the `reserve` (adjusted by `scale`) to infer current utilisation.
4. **Compute supplier APY** – `toAPY` compounds the per-second rate to a yearly factor, and `toAnnualRates` scales this factor by the utilisation to model that only borrowed liquidity earns interest.
5. **Expose formatted rates** – The hook returns `borrowAPR` and `supplyAPY` values that the UI components render after converting them to percentages via `formatRate`/`formatPercentage`.【F:packages/nextjs/components/markets/MarketsGrouped.tsx†L232-L260】【F:packages/nextjs/components/specific/vesu/VesuMarkets.tsx†L1-L70】

With this pipeline in place the Kapan frontend displays numbers that match Vesu's official UI while still letting the adaptive interest model evolve entirely on-chain.

## Differences from earlier (V1) integrations

Vesu V1 and other lenders (e.g. Nostra or Aave) usually return already annualised rates or have simpler utilisation curves. Those integrations therefore only require basic scaling adjustments. In contrast, Vesu V2 exposes low level telemetry (`fee_rate`, accumulators, reserves) and expects clients to replicate the model. The `toAnnualRates` helper encapsulates this logic so the rest of the app can treat Vesu V2 like any other protocol while still respecting its adaptive interest mechanics.【F:packages/nextjs/utils/protocols.ts†L24-L43】【F:packages/nextjs/hooks/useVesuAssets.ts†L94-L141】

By adhering to this approach, Kapan consistently displays accurate borrow APRs and supply APYs for Vesu V2 pools, aligns with the protocol's adaptive rate adjustments, and maintains parity with Vesu's own frontend.

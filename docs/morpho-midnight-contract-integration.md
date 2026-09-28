# Morpho Midnight contract integration

Implemented as a separate `morpho-midnight` protocol in the existing lending-instruction system. The initial execution path uses KapanRouter, existing flash-loan providers, and the existing aggregator gateways. The frontend is documented in [Midnight frontend](./morpho-midnight-frontend.md). No keeper service, public order publication, or live deployment is included.

## Market execution and matching

A market borrow takes existing lender bids with Midnight `take`; the borrower does not need to post a resting order. The gateway accepts a bounded list of offers and their ratifier proofs, fills enough to receive the requested **net loan-token cash**, and tries fallback offers if earlier takes revert. Each offer must belong to the instructed market and have the correct side.

Midnight debt is face-value debt at maturity. For example, receiving 100 units of cash at a discounted price creates more than 100 debt units. Sizing, health and maximum debt limits must use those debt units, not just the cash received. `Repay` here pays face debt directly; it does not purchase discounted credit to close a position.

No custom Midnight taker callback is required for this path. Existing flash loans let the router establish collateral before borrowing, or repay debt before releasing collateral. Maker callbacks embedded in accepted offers are still executed by Midnight and remain subject to its rules.

## Supported instructions

Context for writes is `abi.encode(bytes32 marketId, uint256 collateralIndex, bytes tradeData)`. Non-trading operations use empty `tradeData`; `Borrow` and `Deposit` use `abi.encode(MidnightTypes.Trade)`. View calls accept the first two fields, including a full write context.

| Operation | Meaning | Outputs |
| --- | --- | --- |
| `DepositCollateral` | Supply the selected collateral slot | None |
| `WithdrawCollateral` | Withdraw the selected collateral, capped at its balance; core health checks still apply | Collateral received |
| `Borrow` | Match bids for exact net loan-token proceeds | Cash received |
| `Repay` | Repay up to current face debt | Unused input returned to router |
| `GetBorrowBalance` | Current face debt | Debt amount |
| `GetSupplyBalance` | Selected collateral balance | Collateral amount |
| `Deposit` | Buy lender units against asks within a cash budget | None; unused budget sent directly to user |

Use collateral index `type(uint256).max` for **lender credit** with `GetSupplyBalance` or `WithdrawCollateral`. Credit redemption remains subject to core liquidity. Buying units can also net existing debt according to Midnight's accounting. It is not the same operation as collateral supply.

All mutations require the user to authorize the Midnight gateway, including collateral supply and direct repayment. The gateway implements the existing authorization/deauthorization helper interface. The router checks instruction ownership; direct gateway execution is restricted to the router. Amount pointers must reference the expected token.

The view gateway exposes aggregate collateral value, borrowing capacity, face debt, updated credit, pending fees, LTV, weighted liquidation LTV, health factor, maturity and `pastMaturity`. Values and prices use the **loan token as the unit of account**, not necessarily USD. Read maturity separately: a collateral health ratio alone is not a maturity-risk indicator. `KapanViewRouter` recognizes the distinct protocol ID and supports existing price/LTV consumers. Pair-price calculations reject the wrong asset pair and zero oracle prices.

## Trade bounds and deferred execution

`MidnightTypes.Trade` contains:

| Field | Meaning |
| --- | --- |
| `deadline` | Last allowed execution timestamp |
| `maxUnits` | Maximum units taken in this invocation, across all fills; nonzero and at most uint128 |
| `minUnits` | Minimum units bought by `Deposit`; mandatory for lending |
| `priceLimit` | WAD minimum net proceeds/unit for borrowing; maximum cost/unit for lending |
| `maxApr` | WAD simple APR cap for borrowing, calculated using time to maturity at execution; max uint explicitly disables it |
| `minHealthFactor` | Minimum post-borrow collateral capacity / face debt, WAD; zero uses 1.0 |
| `planProvider`, `planKey` | Optional publisher namespace and key for refreshed offers |
| `takes` | Inline offers, proofs and per-offer fill caps; maximum 32 |

Use either inline takes or a provider/key, never both. Providers publish with `setExecutionPlan(key, takes)`. A provider can update only its own namespace; publishing a plan does not authorize access to a user's funds. The user's stored instruction retains the market, amount/pointer, rate, price, debt-unit, health and deadline bounds. A provider can cause failure or choose among acceptable offers, so choose the provider deliberately. Publishing an empty list disables its plan.

Bounds apply **per instruction invocation**, not as a lifetime order budget. Use existing order cancellation, maximum iterations and chunk sizing to constrain repetition. Revoking Midnight gateway authorization prevents execution. A fixed offer price produces a changing APR as maturity approaches; deferred borrowing should set both a price bound and an APR bound. New borrowing/lending is rejected at or after maturity. Direct repayment remains available afterward.

## Composition and limit orders

- **Leverage:** flash debt asset → aggregator buys collateral → deposit collateral → Midnight borrow exact flash repayment.
- **Deleverage/close:** flash debt asset → repay face debt → withdraw collateral → aggregator sells collateral → repay flash and return surplus.
- **Collateral swap:** flash destination collateral → supply it → withdraw source collateral → swap source into destination to repay flash. Across markets, migrate debt as part of the same atomic route.
- **Debt swap:** flash old debt → repay it → move collateral → borrow the new debt asset → swap new debt into old debt for flash repayment.
- **Blue ↔ Midnight refinance with the same assets:** flash loan asset → repay old protocol → move collateral → borrow from destination. No token swap is needed, but entering Midnight still requires executable financing offers and rate/debt bounds.

The existing conditional-order manager can store instructions referencing a refreshed execution plan. Its handler continues to enforce the swap's limit through the generated CoW order, while the Midnight instruction independently enforces financing bounds. Market prices do not have to remain unchanged; both constraints must hold at execution. `LimitPriceTrigger.shouldExecute` itself does not test an oracle threshold: its generated order amounts express the limit.

The fork suite tests existing manager/handler pre- and post-hooks with deployed Midnight matching and simulated settlement transfers. This is contract compatibility, **not** a verified public CoW solver fill. For flash-backed CoW orders, the existing outer flash-loan adapter must enforce repayment across the entire settlement: CoW can skip/fail hooks, and critical completion must not depend solely on a post-hook. No new custom Midnight maker callback or CoW settlement implementation was added.

Same-asset refinancing should use direct router execution with the refreshed plan. The current CoW manager rejects identical sell/buy tokens, so routing a pure refinance through a same-token CoW order is not supported.

## Fork tests and reproducibility

Run from `packages/hardhat` with Node 22.13+ and npm on PATH:

```sh
node scripts/midnight-tests/run.cjs unit
node scripts/midnight-tests/run.cjs upstream
MIDNIGHT_FORK_RPC_URL=https://mainnet.base.org node scripts/midnight-tests/run.cjs fork
# Or compile once and run all three:
node scripts/midnight-tests/run.cjs all
```

The isolated runner installs locked dependencies into the OS temporary directory, leaving the workspace dependency tree untouched. `MIDNIGHT_TEST_CACHE` selects another cache. Internet access is needed for first installation, pinned upstream source download, and RPC state reads. An archive-capable Base endpoint can replace the public endpoint.

Kapan contracts compile with **solc 0.8.30, Cancun, viaIR, optimizer runs 10**, matching the repository's compiler settings. The test EVM supports Osaka because the deployed Midnight core uses newer instructions. The upstream-core suite compiles the pinned official Midnight source with 0.8.34/Osaka; it does not substitute that source for the deployed core in fork tests.

The fork is pinned to Base block **51,860,129**, hash `0xddc8334ba4ce4b9e8f270fa2b84922c1f3bcd83d69bba95467073cc4a07d3d90`:

| Component | Deployed address |
| --- | --- |
| Midnight | `0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A` |
| SetterRatifier | `0x800B5F12A61B8198a5a6EfD794Cac6699B294d63` |
| Morpho Blue, including flash loans | `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| WETH | `0x4200000000000000000000000000000000000006` |

Matching is simulated by funding local test makers, creating permissionless test markets on the **deployed cores**, authorizing the deployed SetterRatifier, and ratifying single-leaf offer roots. The gateway then calls real `take` with Merkle proofs. No core/ratifier/token code or token storage is overwritten. USDC funding uses impersonated transfers on the local fork; WETH is wrapped normally. A local oracle fixes prices. New markets/offers exist only on the fork; this does not prove live orderbook liquidity.

Five fork scenarios cover:

1. Real matching, consumed offers, lender credit, face repayment and collateral release.
2. Blue → Midnight → Blue using real Blue flash loans.
3. Revoked offer rollback of a whole refinance, followed by successful plan refresh.
4. Leverage and close using production Kapan OneInchGateway/Adapter and real lending/flash contracts, with a deterministic swap venue.
5. Existing conditional manager/handler limit-order hooks with refreshed offers and simulated settlement transfers.

The local suite additionally covers multi-collateral valuation, collateral/debt swaps, rate/debt/health limits, settlement fees, asset-capped offers, signature/expiry fallback, maturity, lender credit, authorization, swap-slippage rollback and token/pair validation. It runs both with a focused fixture and with the pinned upstream core. The unit runner also includes existing router math, approval and authorization regressions.

### Recorded validation (2026-09-27)

`node scripts/midnight-tests/run.cjs all` completed successfully with the locked dependencies:

- 41 local tests: 21 Midnight scenarios and 20 existing router regressions.
- The same 21 Midnight scenarios passed against the pinned upstream core.
- All 5 deployed-contract Base fork scenarios passed.
- `git diff --check` passed. No live transactions or deployments were submitted.

## Deployment and remaining product work

Use the explicit `MorphoMidnightGateway` deploy tag. It is deliberately excluded from the broad `v2` tag and has no deploy dependencies: it reuses the existing live KapanRouter and authorization helper instead of rerunning their setup scripts. Before spending gas, it checks bytecode, ownership, router/helper wiring, and any existing Midnight registration. It deploys the updated KapanViewRouter, copies all supported live protocol registrations (including Alchemix), deploys the two Midnight gateways, and registers the write gateway last. Existing order triggers keep their old immutable view-router address; enabling Midnight limit triggers is a separate deployment.

```sh
# From the repository root, with Node 22 and the encrypted owner account configured:
yarn deploy --network base --tags MorphoMidnightGateway
# Ethereum uses --network mainnet, after its deployment preflight.
```

The wrapper prompts locally for the encrypted deployer password. Do not paste it into chat. Both live routers currently belong to `0x0BE61223F99E57b8b8B7033a77B54Adc7f7cF027`. The deploy task regenerates frontend ABIs/addresses; review and push those deployment records after successful registration. The address registry includes Ethereum and Base; `MORPHO_MIDNIGHT_ADDRESS` is an explicit override and must be verified for the target chain.

Market discovery, offer/proof retrieval, financing-aware sizing, market transactions and rollover UI are implemented. Deferred orders still require execution-plan refresh/cancellation lifecycle support; public CoW support needs actual solver/settlement end-to-end testing. No live deployment or audit has been completed as part of this change.

Validation on 2026-09-28: immutable Yarn install; forced compile of all 104 Solidity files; 41 local router/Midnight tests, 21 pinned upstream-core tests and 5 real deployed Base fork tests; 9 targeted deployment-preflight tests. A local Base-fork rehearsal of the deployment script also passed against the existing live router/helper and verified the Midnight registrations and preservation of existing protocol views; no live transactions were sent. Deployed bytecode sizes are 18,433 bytes (Midnight write), 5,393 bytes (Midnight view), and 12,761 bytes (view router), all below the EIP-170 limit.

Upstream ABI/math provenance is recorded in `packages/hardhat/contracts/v2/gateways/midnight/vendor/README.md`; research and official references are in [the research note](./morpho-midnight-leverage-research-2026-09-27.md).

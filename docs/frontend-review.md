# Frontend Review: Dashboard Modernisation Plan

This review focuses on the authenticated product routes (`/app`, `/markets`,
orders, and transaction modals), rather than the marketing landing page. The
goal is a calmer, faster dashboard that makes risk and the next useful action
obvious without hiding protocol-level detail.

## Changes made in this pass

1. **Removed speculative protocol prefetching from `/app`.** The previous idle
   callback loaded the entire EVM set while Starknet was selected, and the
   Starknet views while any EVM network was selected. Those chunks are not a
   likely next interaction; they compete with wallet hydration, queries, and
   the selected protocol's data for CPU, bandwidth, and memory.
2. **Made `StableArea` actually stable.** It previously created one
   `ResizeObserver` per protocol card, set state during every size change, and
   animated the card's minimum height on price/position updates. Live lending
   data changes frequently, so that made routine refreshes look like layout
   shifts. The component now reserves its declared space without observing or
   animating live card height.
3. **Replaced the `/app` conditional rendering wall with a typed network
   registry.** Chain id, warning copy, and each network's protocol list now
   live in one configuration. A shared pane renders the wallet and protocol
   slots, so adding a network or protocol no longer requires copying a block of
   JSX with subtly different loading behaviour.

## Priority 0 — correctness and trust

### One source of truth for selected network

`app/app/page.tsx` owns `selectedNetwork` while `NetworkFilter.tsx` owns a
second internal selected value, URL persistence, local-storage persistence,
and wallet-driven updates. This works only because every state change is
carefully mirrored through a callback. It should become a controlled component:

```ts
<NetworkFilter value={selectedNetwork} onChange={setSelectedNetwork} />
```

Keep URL/local-storage/wallet synchronisation in one `useSelectedNetwork`
hook. The filter should render buttons and report intent only. This removes
loop-guard refs, duplicated state, and the possibility of a highlighted network
whose dashboard does not match it.

### Make loading status protocol-aware

The header reports a portfolio total after a fixed 800 ms settling window.
Network RPC latency is not bounded by that duration, so a partial total may be
shown as complete. Store an expected protocol list for the selected network and
show `Loading 3/7 sources` until each enabled source reaches success, empty, or
error. Totals should expose a `partial` state rather than pretending precision.

### Make risk persistent, not decorative

Risk should be visible at the dashboard level, not only within an expanded
position. Add a compact sticky risk strip above protocol cards:

* highest health-factor / LTV risk;
* estimated liquidation price where supported;
* stale price or failed-protocol warning;
* one primary action (repay, add collateral, or inspect).

Do not derive safety claims from incomplete sources; label the result as
partial when any protocol is still loading or failed.

## Priority 1 — performance and responsiveness

### Continue the `/app` network registry

The dashboard page now has a typed registry containing chain id, warning, and
protocol factories, rendered through one `EvmNetworkPane`. Keep expanding this
single source of truth with wallet availability and loading expectations. The
next step is to expose the same registry to the network filter and totals
store, so a new network cannot be partially wired.

The registry should retain dynamic imports for protocol implementations; only
the selected network's factories should render. Do not prefetch every protocol
after load. If prefetching proves useful, prefetch just the next network chosen
from an explicit user hover/focus event and cancel it on slow connections.

### Apply a query policy by data type

Protocol position, token price, rate, transaction, and static asset metadata
currently originate from many independent hooks. Document and enforce:

| Data | Stale time | Refetch trigger |
| --- | --- | --- |
| Token metadata / protocol configuration | 24 h | chain change only |
| Position balances | 15–30 s | block, focus, completed transaction |
| Prices / risk values | 10–15 s | visibility-aware polling |
| Rates | 30–60 s | focus and explicit refresh |

Use React Query query keys that include chain, account, protocol, and asset.
Pause polling while `document.visibilityState !== "visible"`. Batch price
lookups per chain rather than letting each position issue an identical request.

### Render long protocol content on demand

Protocol cards should render a summary by default and mount position rows only
after expansion. Use `content-visibility: auto` plus `contain-intrinsic-size`
for below-the-fold protocol sections. This is a better fit than JavaScript
height observers: the browser can skip offscreen paint/layout without turning
live data refreshes into animation work.

## Priority 2 — interaction and visual system

### Establish three surface levels

The product currently mixes DaisyUI cards, custom gradients, borders, and
ad-hoc opacity values. Define reusable primitives:

1. **Canvas** — page background and global navigation.
2. **Panel** — protocol summary and filter bars, subtle border and shadow.
3. **Inset** — position rows and grouped market details, no competing shadow.

Use one border colour, one hover treatment, and a small radius scale (8, 12,
16 px). Avoid gradient fills on normal data surfaces; reserve accent colour for
the selected tab, a primary action, or actionable risk.

### Set an information hierarchy for each protocol card

Desktop: protocol identity, net value, and risk on the first line; supply,
debt, net APY, and status on the second. Mobile: identity + risk first, then
the net value; hide secondary yield detail behind expansion. Numeric values
must use tabular figures and fixed-width labels to prevent horizontal jitter.

### Treat motion as feedback

Use 120–180 ms opacity/colour transitions for hover and selection. Reserve
spring motion for moving between tabs or opening a detail panel. Never animate
layout in response to a price poll, a loading state, or a changing position
balance. Every motion pattern must honour `prefers-reduced-motion`.

### Unify action affordances

Supply, borrow, repay, move, swap, close, and automation controls should share
one `PositionActionBar` API. Each action needs an explicit enabled/disabled
reason and a consistent confirmation model. Destructive actions should be
visually distinct but not error-red until there is actual danger.

## Delivery sequence

1. Controlled network selection + query-state aggregation.
2. Typed network/protocol registry + summary-first protocol cards.
3. Shared surfaces, metric cells, risk strip, and action bar.
4. Per-route bundle analysis and React Profiler sessions on a populated wallet.
5. Visual regression stories for the header, filters, protocol summary,
   position row, and each modal state.

## Success measures

Track these before and after each phase:

* initial `/app` JavaScript and selected-network chunk size;
* interaction-to-next-paint for switching a network and expanding a card;
* number of RPC/HTTP requests during 60 seconds on a background tab;
* cumulative layout shift during initial load and a price refresh;
* percentage of dashboards with complete versus partial source data.

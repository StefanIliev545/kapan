---
name: portfolio-state
description: Load when adding dashboard protocols or changing position loading, query caching, or wallet/network transitions
---

# Portfolio state ownership

Dashboard totals belong to the selected network and viewing wallet, not the application-wide Zustand store.

- `app/app/page.tsx` computes that scope. `DashboardTotalsProvider` supplies an independent store for it. Only the protocol panes remount when the scope changes; keep `NetworkFilter` mounted so pending wallet switches retain their state.
- Publish through `useSetProtocolTotals` from `contexts/DashboardTotalsContext.tsx`, or the helpers in `hooks/common/useProtocolTotals.ts`. These are inert outside a dashboard and while disconnected. Publish zero for a successfully empty protocol, but do not publish incomplete or failed reads as a complete balance.
- Retain React Query's account/chain/pool-keyed results for rendering. Do not copy positions into a ref cache: ref writes do not trigger rendering, and rejecting empty arrays leaves closed positions visible.
- `StarknetConfig` must receive the configured `lib/queryClient.ts` client. Otherwise its nested provider silently bypasses the application's cache defaults.
- The scaffold Starknet wrapper accepts both caller query-option forms and forwards the supported options flat to the installed SDK. Watch the shared block source while retaining a stable latest-read key; changing the key every block loses previous data when a refresh fails. Different account, chain, contract, function or arguments must never borrow previous data.

Regression coverage lives in `app/app/__tests__/portfolioScope.test.tsx`, `hooks/scaffold-stark/__tests__/useScaffoldReadContract.test.ts`, and the Vesu hook/component suites. Include successful-empty, disconnect, delayed refresh, read failure and scope-transition cases when changing these paths. Run tests with the installed Node 22 version and run the full frontend TypeScript check; transpilation-only tests do not establish type correctness.

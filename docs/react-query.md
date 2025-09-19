# React Query Conventions

This project standardises its TanStack Query usage to maximise cache reuse and
avoid redundant RPC calls.

## Query client

- A single `QueryClient` instance lives in `packages/nextjs/lib/queryClient.ts`.
- Provider wiring happens in `packages/nextjs/app/providers/QueryProvider.tsx`
  and is included once at the root layout.
- Global defaults favour stability over aggressive refetching:
  - `staleTime`: 60 seconds by default (override per-query).
  - `gcTime`: 15 minutes to keep useful data warm.
  - `refetchOnWindowFocus`: disabled globally – opt-in per query when real-time
    data is required.
  - Mutations do not retry automatically; use targeted invalidation or
    `setQueryData` when appropriate.

## Query keys

- Query keys come from the `qk` factory in `packages/nextjs/lib/queryKeys.ts`.
- Keys are arrays of primitives and always include chain IDs and lower-cased
  addresses/tokens for deterministic caching.
- Never inline string keys – import from `qk` so that identical requests share
  cache entries across the app.

## Stale times & polling

Use explicit `staleTime` values that reflect how quickly the underlying data
changes:

| Data type                  | Suggested `staleTime`      |
| -------------------------- | -------------------------- |
| Token metadata/config      | `Infinity`                 |
| Protocol information lists | 5 – 30 minutes             |
| Prices/oracle feeds        | 30 – 60 seconds            |
| Wallet balances/positions  | 10 – 30 seconds            |
| Event/history pagination   | 1 – 5 minutes + placeholder data |

Only enable `refetchInterval` or focus refetching on queries that truly need to
stay fresh.

## Mutations

- All writes should use `useMutation`.
- After success, invalidate the minimal set of related queries via
  `queryClient.invalidateQueries` or update the cache with
  `queryClient.setQueryData` to avoid unnecessary network calls.

Following these guidelines keeps the UI responsive while dramatically reducing
redundant RPC traffic.

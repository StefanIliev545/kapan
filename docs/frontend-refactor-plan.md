# Frontend Refactoring Plan

This document outlines a staged approach for refactoring the Next.js front end to reduce duplication, simplify component structure and centralize shared logic.

## 1. Decompose Position Components
- Extract common presentation pieces (header, stats, action row) from `BorrowPosition` and `SupplyPosition`.
- Introduce a generic `PositionCard` that accepts a type (`"borrow" | "supply"`) and renders network‑specific behaviours via props.
- Keep protocol‑specific or network‑specific UI in small subcomponents placed under `components/specific/*`.

## 2. Unify Modals
- Replace duplicate EVM/Starknet modal implementations with a single modal layer.
- Network differences handled via props or small wrappers inside `components/modals/network/*`.
- Ensure shared modal state management through `useModal`.

## 3. Consolidate Network Hooks
- Move duplicated hooks to `hooks/common` and have network packages provide wrappers.
- Start with `useNetworkColor` and gradually merge others (`useNetwork`, `useDeployedContractInfo`, etc.).
- Network specific configuration remains inside `hooks/scaffold-eth` and `hooks/scaffold-stark`.

## 4. Centralise Utilities and Formatting
- Create `utils/format` for currency and percentage helpers.
- Store protocol logos and token metadata under `data/` and expose retrieval helpers.
- Remove inline helpers from components in favour of shared utilities.

## 5. Standardise Data Fetching
- Wrap contract reads and API calls with React Query for caching and error handling.
- Replace `mockData` with real endpoints; keep a dev‑only mock service when needed.

## 6. Iterative Execution
1. **Foundational hooks** – move shared hooks to `hooks/common` (done for `useNetworkColor`).
2. **Refactor BorrowPosition/SupplyPosition** to use shared card and utilities.
3. **Unify modals** once card structure is stable.
4. **Clean remaining duplicate hooks/utilities** and add tests.

Each step should be accompanied by linting and incremental tests to maintain stability.

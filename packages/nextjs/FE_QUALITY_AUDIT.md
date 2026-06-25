# Frontend Quality & Redundancy Audit

> Generated from an 8-agent semantic review of `packages/nextjs` (components/hooks/utils/app), cross-checked with jscpd (duplication) and knip (dead code). **85 findings**, ~**8,785 LOC** of removable redundancy. Every dead-code item was verified by exact import search (knip over-reports — treat its output as leads only).

## How to read this
Effort: S (<1h) / M (half-day) / L (multi-day). Impact = user-visible-risk-reduction + maintainability. "Est LOC" = lines removable. Nothing here is committed; this is a backlog.

## Executive summary
The FE's problem is **not** copy-paste (jscpd measures only **1.81%** exact duplication). It's **structural parallelism**: nearly every feature is implemented N times — once per protocol, once per swap-operation — instead of once over a shared core.

Four forces dominate:
1. **The swap-config hook family** — `useCollateralSwapConfig` (2,183 LOC), `useClosePositionConfig` (2,007), `useDebtSwapConfig` (1,371) each re-implement the *same* pipeline: router resolution → quote fetching (1inch/Kyber/Pendle/CoW) → price-impact → flash-loan setup → protocol context encoding → instruction building. Extracting that core (`useQuoteFetching`, `useFlashLoanConfig`, `swapInstructionBuilders`) is the single highest-leverage move (~1,400 LOC and it unblocks splitting the god-hooks).
2. **Per-protocol view duplication** — `AaveForkProtocolView` ↔ `VenusProtocolView` are ~526 identical lines apart from config; the Aave/Compound/Venus/Euler views share a shape that wants one config-driven base (~700 LOC).
3. **Markets-section duplication** — `Euler/Morpho/Compound MarketsSection` each redefine `TokenIcon`, `SearchableSelect`, `CollateralStack`, and the TanStack `COL_LAYOUT` table scaffold (~470 LOC) — extract a shared markets-table kit.
4. **Hook parallelism + barrel bloat** — Vesu V1/V2 pairs, ADL/AutoLeverage, position-hooks, and `index.ts` files re-exporting hundreds of unused symbols.

The highest-ROI sequence is: knock out the safe quick wins, then extract the **swap core** before decomposing the god-hooks, then unify the protocol views, then the markets kit. The swap/instruction-building code is the **riskiest** (it builds on-chain calldata) — refactor it last-touched-first with byte-identical-calldata verification, not by eye.

## Top 15 highest-leverage refactors

| # | Title | Cat | Sev | Eff | ~LOC | Files |
|---|-------|-----|-----|-----|------|-------|
| 1 | Vesu V1/V2 window pagination loop duplicated across both hooks | redundancy | high | S | 31 | hooks/useVesuLendingPositions.ts (+1) |
| 2 | Vesu V1/V2 merge and loading state logic duplicated | redundancy | high | S | 50 | hooks/useVesuLendingPositions.ts (+1) |
| 3 | Unsafe `any` type cast in useVesuV2Assets position transformation | typesafety | high | S | - | hooks/useVesuV2Assets.ts |
| 4 | Quote fetching & selection logic repeated across 3 protocol config hooks | redundancy | high | M | 250 | components/modals/common/useCollateralSwapConfig.tsx (+2) |
| 5 | Flash loan setup & selection duplicated in protocol config hooks | redundancy | high | M | 180 | components/modals/common/useCollateralSwapConfig.tsx (+2) |
| 6 | Context resolution logic duplicated across RefinanceModalEvm and shared instruction helpers | redundancy | high | M | 150 | components/modals/RefinanceModalEvm.tsx (+2) |
| 7 | Flash loan instruction building duplicated in multiplyEvmHelpers and adlAutomationHelpers | redundancy | high | M | 80 | components/modals/multiplyEvmHelpers.ts (+1) |
| 8 | AaveForkProtocolView and VenusProtocolView share identical structure (526 lines) with only config differences | redundancy | high | M | 350 | components/specific/common/AaveForkProtocolView.tsx (+1) |
| 9 | AaveForkProtocolView at 626 lines: oversized with intermingled concerns (config, data-fetch, modal state, metrics, render) | godfile | high | M | 200 | components/specific/common/AaveForkProtocolView.tsx |
| 10 | Duplicate TokenIcon, SearchableSelect, CollateralStack across three MarketsSection files | redundancy | high | M | 350 | components/specific/euler/EulerMarketsSection.tsx (+2) |
| 11 | Duplicate TanStack Table COL_LAYOUT pattern and table header/body rendering logic | redundancy | high | M | 120 | components/specific/euler/EulerMarketsSection.tsx (+1) |
| 12 | EulerMarketsSection at 1137 LOC combines shared UI, row types, table defs, and state management | godfile | high | M | - | components/specific/euler/EulerMarketsSection.tsx |
| 13 | MorphoMarketsSection at 1331 LOC combines shared UI, row types, table defs, modal plumbing, and loop APY calculation | godfile | high | M | - | components/specific/morpho/MorphoMarketsSection.tsx |
| 14 | useEulerLendingPositions is oversized at 987 LOC with deeply nested liquidity logic | godfile | high | M | 120 | hooks/useEulerLendingPositions.ts |
| 15 | Duplicate helper functions in useADLOrder and useAutoLeverageOrder hooks | redundancy | high | M | 65 | hooks/useADLOrder.ts (+1) |

## Redundancy map (39 findings, ~4329 LOC)

### AaveForkProtocolView and VenusProtocolView share identical structure (526 lines) with only config differences `[high/M/~350 LOC]`
- **Files:** `components/specific/common/AaveForkProtocolView.tsx`, `components/specific/venus/VenusProtocolView.tsx`
- **Problem:** AaveForkProtocolView (626 lines) and VenusProtocolView (576 lines) implement the exact same pattern: positionToSwapAsset helper, PositionMetrics interface, identical useEffect/useMemo blocks for metrics/utilities/collateralBreakdown/modal handlers, identical render logic with BaseProtocolHeader + CrossPositionLayout, and identical modal stacks. Only differences are protocol name, data-fetch hook (AaveLikeLendingPositions vs VenusLendingPositions), and E-Mode handling (AaveFork includes EModeToggle, Venus omits it). This is ~450+ lines of structural duplication across two files.

Spark and ZeroLend also wrap AaveForkProtocolView with trivial configs (32 lines each), suggesting the same structure could apply universally.
- **Fix:** Create a generic `CrossTopologyProtocolView` component that accepts a config object. Extract protocol-agnostic logic:

1. Create `GenericCrossTopologyProtocolViewProps` interface with fields: `protocolName`, `protocolIcon`, `protocolUrl`, `dataFetcher` (hook returning `{suppliedPositions, borrowedPositions, hasLoadedOnce}`), `riskParamsFetcher`, `positionGroupFetcher`, `apyMapFetcher`, `headerExtra?` (for E-Mode toggle), `useADLSupported` hook ref.

2. Move all shared logic (positionToSwapAsset, EMPTY_METRICS, collateralBreakdown calculation, modal state, event handlers, render JSX) into the component.

3. Replace AaveForkProtocolView with a thin wrapper that passes `useAaveLikeLendingPositions` as the dataFetcher and optionally includes EModeToggle in headerExtra.

4. Replace VenusProtocolView with a thin wrapper passing `useVenusLendingPositions`.

5. Update Spark/ZeroLend to use the base component directly instead of wrapping AaveForkProtocolView.

### Duplicate TokenIcon, SearchableSelect, CollateralStack across three MarketsSection files `[high/M/~350 LOC]`
- **Files:** `components/specific/euler/EulerMarketsSection.tsx`, `components/specific/morpho/MorphoMarketsSection.tsx`, `components/specific/compound/CompoundMarketsSection.tsx`
- **Problem:** EulerMarketsSection (lines 93-410) and MorphoMarketsSection (lines 186-510) define nearly identical TokenIcon, SearchableSelect, CategoryButton, OptionButton, and CollateralStack components. CompoundMarketsSection duplicates TokenIcon and CollateralStack again (lines 53-145). These are copy-pasted implementations without shared abstraction.
- **Fix:** Extract a reusable MarketComponentLibrary module at components/markets/MarketComponentLibrary.tsx containing: (1) generic SearchableSelect component, (2) CollateralStack parameterized over collateral type, (3) CategoryButton/OptionButton helpers. Replace all three files' implementations with imports. For TokenIcon, delegate to existing TokenIcon from components/common/TokenDisplay.tsx.

### Parallel hook implementations: useADLOrder and useAutoLeverageOrder share ~80% structure `[high/L/~300 LOC]`
- **Files:** `hooks/useADLOrder.ts`, `hooks/useAutoLeverageOrder.ts`
- **Problem:** Both hooks implement nearly identical order creation patterns: state management (isLoading, error), contract lookups (conditionalOrderManager, trigger, adapter), delegation checks, salt generation, appData registration, authorization flows. The main hook bodies (lines 299-509 in ADL vs 366-694 in AutoLeverage) share identical control flow. AutoLeverage adds ~80 lines of Alchemix-specific logic (buildAlchemixPreInstructions/PostInstructions) but the base pattern is duplicated.
- **Fix:** Create a shared 'createConditionalOrder' factory function that accepts protocol-specific instruction builders and trigger contract info. This enables both hooks to reuse the order creation orchestration while injecting protocol-specific behavior (ADL vs AutoLeverage, standard vs Alchemix). Extract Alchemix topology into a separate builder factory.

### Quote fetching & selection logic repeated across 3 protocol config hooks `[high/M/~250 LOC]`
- **Files:** `components/modals/common/useCollateralSwapConfig.tsx`, `components/modals/common/useDebtSwapConfig.tsx`, `components/modals/common/useClosePositionConfig.tsx`
- **Problem:** All three protocol swap hooks implement near-identical quote-fetching workflows: resolveSwapRouter (fallback logic), quote fetching from 1inch/Kyber/Pendle/CoW, price impact calculation, amountOut derivation, and best-quote selection. Visible in findBestQuote (144 LOC in useCollateralSwapConfig), calculateAmountOut (60 LOC), calculateQuotesPriceImpact (50 LOC) functions duplicated verbatim or with trivial diffs across hooks. No shared helper.
- **Fix:** Extract into 'useQuoteFetching.ts' hook that encapsulates: (1) swap router resolution (resolveSwapRouter logic), (2) unified quote fetching coordination (manage 1inch, Kyber, Pendle, CoW hooks), (3) best-quote selection & price-impact calculation. Return { swapRouter, setSwapRouter, amountOut, priceImpact, isQuoteLoading, quoteError, quoteResult }. Callers pass: chainId, selectedFrom, selectedTo, amountIn, slippage, executionType. Reduces 250+ LOC duplication; centralizes router fallback logic.

### Order/instruction building duplicated across hooks: pattern reuse opportunity `[medium/L/~250 LOC]`
- **Files:** `hooks/useCowOrder.tsx`, `hooks/useADLOrder.ts`, `hooks/useAutoLeverageOrder.ts`
- **Problem:** All three hooks implement similar order lifecycle: salt generation, appData registration, authorization fetching, instruction encoding, transaction execution. useCowOrder.tsx has buildOrderCalls() factory (lines 348-467) that mirrors the orchestration in useADLOrder/useAutoLeverageOrder. Both implement flattenInstructions/deduplication logic independently. Authorization call execution, transaction receipt parsing, and error handling are reimplemented across hooks.
- **Fix:** Create an abstraction layer: BaseConditionalOrderBuilder or OrderOrchestrator that encapsulates: (1) salt+appData setup, (2) authorization management, (3) instruction encoding, (4) transaction batching. Hooks become thin adapters that supply protocol-specific instruction builders and trigger details. This unifies error handling and reduces maintenance burden.

### Market/limit order switch & executionType state replicated across all config hooks `[medium/M/~200 LOC]`
- **Files:** `components/modals/common/useCollateralSwapConfig.tsx`, `components/modals/common/useDebtSwapConfig.tsx`, `components/modals/common/useClosePositionConfig.tsx`
- **Problem:** All hooks mirror: useState<ExecutionType>, setExecutionType, executionType checks in quote-loading & submit paths. useWalletSwapConfig statically disables it (setExecutionType no-op). No shared abstraction; each reimplements conditional-order trigger param encoding, limit-order instruction builders inline.
- **Fix:** Create 'useExecutionTypeConfig.ts' hook that encapsulates: (1) executionType state, (2) isLimitSubmitting, customBuyAmount/useCustomBuyAmount state, (3) numChunks & chunk-splitting logic, (4) conditional-order trigger params assembly (already partially shared via useCowConditionalOrder). Returns { executionType, setExecutionType, limitOrderConfig, onAmountOutChange, limitPriceButtons }. Reduces 150+ LOC per hook.

### Protocol-specific context encoding (Morpho, Euler, standard) duplicated across hooks `[medium/M/~200 LOC]`
- **Files:** `components/modals/common/useCollateralSwapConfig.tsx`, `components/modals/common/useDebtSwapConfig.tsx`, `components/modals/common/useClosePositionConfig.tsx`
- **Problem:** Each hook reimplements: protocol detection (isMorpho, isEuler checks via string.toLowerCase()), context setup (useMemo blocks building oldContext/newContext, encoding via encodeMorphoContext/encodeEulerContext), conditional-order builder dispatch (if isMorpho → buildMorphoXXX else if isEuler → buildEulerXXX else buildStandardXXX). Pattern appears ~5 times per hook (setup, conditional order, market order). No abstraction.
- **Fix:** Create 'useProtocolContext.ts' hook: accepts protocolName, market/position data. Returns { isProtocol: boolean, protocol: 'morpho'|'euler'|'standard', oldContext, newContext, contextEncoded, buildInstructions(type, params) }. Centralizes detection, setup, and dispatch. Reduces 200+ LOC across three hooks.

### Flash loan setup & selection duplicated in protocol config hooks `[high/M/~180 LOC]`
- **Files:** `components/modals/common/useCollateralSwapConfig.tsx`, `components/modals/common/useDebtSwapConfig.tsx`, `components/modals/common/useClosePositionConfig.tsx`
- **Problem:** All three hooks replicate: useMovePositionData + useFlashLoanSelection hook calls, flash loan provider initialization (getCowFlashLoanProviders, getPreferredFlashLoanLender, calculateFlashLoanFee), limitOrderConfig useState + initialization logic. Usecase example: useClosePositionConfig lines 599-625 is structurally identical to useDebtSwapConfig ~360–385 and useCollateralSwapConfig equivalents.
- **Fix:** Create 'useFlashLoanConfig.ts' hook: accepts (isOpen, chainId, protocolName, position, debtToken?). Returns { selectedProvider, setSelectedProvider, flashLoanProviders, limitOrderConfig, setLimitOrderConfig, cowFlashLoanInfo }. Centralizes provider selection, CoW limit-order init, and fee calculation. Saves ~120 LOC per hook.

### Context resolution logic duplicated across RefinanceModalEvm and shared instruction helpers `[high/M/~150 LOC]`
- **Files:** `components/modals/RefinanceModalEvm.tsx`, `components/modals/multiplyEvmHelpers.ts`, `components/modals/adlAutomationHelpers.ts`
- **Problem:** Three similar patterns encode protocol/market context:
- RefinanceModalEvm.tsx (lines 155-190, 229-250): `resolveDestContext`, `resolveSourceCtx`, `resolveBorrowContext` — per-collateral Euler context building with manual vault lookups
- multiplyEvmHelpers.ts (lines 409-441, 579-583): inline context resolution in `buildDepositInstructions` + `buildInitialDepositInstructions` (duplicated checks: isMorpho, isCompound, isAlchemix)
- adlAutomationHelpers.ts (lines 140-193): `encodeProtocolContext` — similar switch logic but for ADL trigger params
Each reinvents the wheel for determining isMorpho/isCompound/isAlchemix and context encoding.
- **Fix:** Create `useProtocolContext` hook in a new shared file (`packages/nextjs/hooks/useProtocolContext.ts`):
```typescript
interface ProtocolContextInput {
  protocolName: string;
  morphoContext?: MorphoMarketContextForEncoding;
  eulerContext?: EulerVaultContextForEncoding;
  compoundMarket?: Address;
  alchemixContext?: { marketId: number; tokenId: bigint };
}
function resolveProtocolContext(input: ProtocolContextInput): `0x${string}` { /* unified logic */ }
function isProtocol(protocolName: string, key: string): boolean { /* normalized check */ }
```
Replace inline checks with hook calls. Update multiplyEvmHelpers to use `resolveProtocolContext`. Move ADL's `encodeProtocolContext` logic there. Estimate: 80 shared LOC, ~60 LOC removed per file.

### Starknet move position hooks: useStarknetMovePosition vs Legacy variant `[medium/M/~150 LOC]`
- **Files:** `hooks/useStarknetMovePosition.ts`, `hooks/useStarknetMovePositionLegacy.ts`
- **Problem:** useStarknetMovePositionLegacy (291 lines) is an older implementation that shares ~70% of logic with the newer useStarknetMovePosition (602 lines). Both build Starknet instruction tuples, manage authorizations, and execute move_debt calls. Legacy version has simpler context builders, while the new version refactored these inline. However, core instruction generation, authorization handling, and call building patterns are duplicated. File naming suggests legacy is not maintained.
- **Fix:** Remove useStarknetMovePositionLegacy entirely if it is not actively used. If it is still referenced, migrate callers to useStarknetMovePosition and deprecate the legacy hook. If both must coexist, extract shared instruction-building logic (context builders, authorization compiling) into a separate module and have both hooks import it.

### Helper function definitions repeated with cosmetic differences `[low/S/~120 LOC]`
- **Files:** `components/modals/common/useCollateralSwapConfig.tsx`, `components/modals/common/useClosePositionConfig.tsx`
- **Problem:** computeUsdFallback (617 LOC useCollateralSwapConfig) vs equivalent logic inline in useClosePositionConfig. buildTargetAssets (632–694 useCollateralSwapConfig) has a simpler non-Morpho/non-Euler equivalent inline elsewhere. calculateWithdrawAmount (456 useCollateralSwapConfig) also appears in useClosePositionConfig. Naming/param order inconsistent.
- **Fix:** Extract to 'swapConfigHelpers.ts': export { computeUsdFallback, buildTargetAssets(isMorpho, isEuler, ...), calculateWithdrawAmount }. Import in all hooks. Standardize param order & naming.

### Modal state and event handlers identical across AaveFork and Venus (swap, multiply, ADL, borrow modals) `[medium/M/~120 LOC]`
- **Files:** `components/specific/common/AaveForkProtocolView.tsx`, `components/specific/venus/VenusProtocolView.tsx`
- **Problem:** Both files define nearly-identical modal state management: `useState` for selectedSwapPosition/isMarketsOpen, useModal() for 5 modals, `handleOpenSwap/handleCloseSwap` callbacks (identical logic), `toggleCollapsed/toggleMarketsOpen` with same implementation, and footer memos (`collateralFooter`, `debtFooter`, `positionsToolbar`). This spans 150+ lines of identical code.
- **Fix:** Extract into a custom hook `useCrossTopologyProtocolState()` that returns `{selectedSwapPosition, setSelectedSwapPosition, isMarketsOpen, setIsMarketsOpen, isCollapsed, setIsCollapsed, modalState, handlers, footers}`. Allows AaveFork and Venus to share 120+ lines in one hook import.

### Duplicate TanStack Table COL_LAYOUT pattern and table header/body rendering logic `[high/M/~120 LOC]`
- **Files:** `components/specific/euler/EulerMarketsSection.tsx`, `components/specific/morpho/MorphoMarketsSection.tsx`
- **Problem:** Both files define identical COL_LAYOUT objects (Euler lines 82-90, Morpho lines 127-136) mapping column IDs to width/align/show CSS. Table header rendering (Euler 1048-1080, Morpho 1240-1262) is 95% identical boilerplate: headerGroup mapping, COL_LAYOUT lookups, conditional classes for market/collaterals/actions columns. Tbody rendering (Euler 1082-1110, Morpho 1264-1286) duplicates the same pattern.
- **Fix:** Extract generic TableHeaderRow and TableBodyRows components that accept COL_LAYOUT config and column helpers, reducing 120 LOC of boilerplate. Standardize sort icon logic to use header.column.getIsSorted() consistently (Morpho uses this correctly at line 1255).

### PendingOrdersDrawer (836 LOC) should extract order-section rendering `[medium/M/~120 LOC]`
- **Files:** `components/common/PendingOrdersDrawer.tsx`
- **Problem:** PendingOrdersDrawer renders repetitive order-type sections (lines 468-551): each order category (ADL, Auto-Leverage, Limit, Unknown, Completed) follows the same pattern: sticky header (badge + icon + title) + mapped order items. This pattern repeats 5 times with only label/icon/Icon/badgeClass varying. Also, the bridge-item rendering (lines 595-692) is a self-contained ~100 LOC function tightly coupled inside the component.
- **Fix:** Extract `<OrderSection icon={Icon} label="ADL" orders={orders} />` and `<BridgeSection bridges={bridges} />` sub-components. Move `renderBridgeItem()` logic into a `BridgeItem` component. This reduces the main render from ~300 LOC to ~150 LOC, making state flows and data dependencies clearer. Estimate ~120 LOC removed.

### Duplicate StickySection component and scroll logic across about/info pages `[medium/M/~120 LOC]`
- **Files:** `app/about/AboutPageContent.tsx`, `app/info/InfoPageContent.tsx`
- **Problem:** StickySection (lines 471-538 in about, lines 188-263 in info) is nearly identical. Both implement scroll-based opacity/scale transforms, progress tracking, and memo optimization. Only content differs. ~75 LOC duplication. Also duplicate SPRING_CONFIG (line 541 about) and related animation constants (lines 541-574 info).
- **Fix:** Extract StickySection to packages/nextjs/components/landing/StickySection.tsx. Pass SectionData interface and let each page compose sections differently. Shared spring config to a landing animation constants module (framer.ts).

### About/Info pages duplicate page layout, section data structure, and scroll mechanics `[medium/M/~120 LOC]`
- **Files:** `app/about/AboutPageContent.tsx`, `app/info/InfoPageContent.tsx`
- **Problem:** Both pages have identical structure: scroll container -> sticky viewport -> StickySection array -> scroll hint. SCROLL_CONTAINER_HEIGHT_STYLE and scroll config duplicated. About has 3 sections, Info has 6. Same grid/flex layout. ~100 LOC duplication in layout boilerplate.
- **Fix:** Create LandingPageLayout component (packages/nextjs/components/landing/LandingPageLayout.tsx) accepting sections[] and optional props. Both pages call <LandingPageLayout sections={aboutSections} /> and <LandingPageLayout sections={infoSections} />. Drastically reduces duplication.

### Mobile row rendering duplicated: MobileVaultRow vs MobileMarketRow `[medium/M/~100 LOC]`
- **Files:** `components/specific/euler/EulerMarketsSection.tsx`, `components/specific/morpho/MorphoMarketsSection.tsx`
- **Problem:** MobileVaultRow/MobileVaultRowItem (Euler 494-607) and MobileMarketRow/MobileMarketRowItem (Morpho 557-655) have 85% identical structure and code for expand/collapse state, callback handling, token display, stat rendering on expand, and CSS. Only difference is onLoop vs onBorrow callback name.
- **Fix:** Extract generic MobileMarketRowComponent that accepts data object plus callbacks (onPrimary, onSecondary) and render props for custom stat display. Reduces 100 LOC of duplicated mobile UI code.

### Duplicated action-building logic in SupplyPosition and BorrowPosition `[high/M/~90 LOC]`
- **Files:** `components/SupplyPosition.tsx`, `components/BorrowPosition.tsx`
- **Problem:** Both SupplyPosition (lines 185-274) and BorrowPosition (lines 157-272) contain nearly identical logic for building SegmentedAction arrays: memoized callbacks mapping button-visibility flags to action objects with title-generation, disabled state calculation, and icon/label assignment. BorrowPosition extracts title logic to getActionTitle() helper, but SupplyPosition inlines it. This pattern is repeated—both components wrap actions in useMemo, both construct title strings with wallet-connection and balance checks.

The shared logic: check visibility flag → push action with icon + label + onClick → determine disabled state (!isWalletConnected || actionsDisabled || !hasBalance) → assign title with conditional nesting.
- **Fix:** Extract a shared `usePositionActions()` hook in `/packages/nextjs/components/common/` that accepts position-type metadata (supplyActions config, borrowActions config) and returns a memoized SegmentedAction[]. The hook should parameterize action keys/labels/icons while centralizing the disable-state and title-generation logic. Both SupplyPosition and BorrowPosition call it with their specific button-visibility config; reduces ~90 LOC of copy-paste logic per file.

### Flash loan instruction building duplicated in multiplyEvmHelpers and adlAutomationHelpers `[high/M/~80 LOC]`
- **Files:** `components/modals/multiplyEvmHelpers.ts`, `components/modals/adlAutomationHelpers.ts`
- **Problem:** Both files build post-instruction sequences for flash loan repayment with nearly identical structure:
- multiplyEvmHelpers.ts (lines 428-493): `buildFlashLoanModeChunks` creates chunks with approve→deposit→borrow→push pattern
- adlAutomationHelpers.ts (lines 331-384): `buildADLFlashLoanPostInstructions` approves debt→repays→withdraws collateral→pushes to manager
The encoding pattern (approve(1), protocolOp, pushToken) appears in both. Only the operation type differs (Deposit vs Repay).
- **Fix:** Create `buildFlashLoanRepaymentInstructions(params: { lendingOp: LendingOp; tokenAddress: Address; userAddress: Address; protocolName: string; context: string; outputIndex: number; targetManager?: Address }): ProtocolInstruction[]` helper in `utils/v2/instructionHelpers.ts`. Then:
- multiplyEvmHelpers: Replace lines 459-472 with call to helper(LendingOp.Deposit, ...)
- adlAutomationHelpers: Replace lines 341-377 with call to helper(LendingOp.Repay, ...) + helper(LendingOp.WithdrawCollateral, ...)
Estimate: 40 shared LOC, ~50 removed across both files.

### Identical collateralBreakdown calculation logic in AaveFork, Venus, Compound, Euler `[medium/S/~80 LOC]`
- **Files:** `components/specific/common/AaveForkProtocolView.tsx`, `components/specific/venus/VenusProtocolView.tsx`, `components/specific/compound/CompoundProtocolView.tsx`, `components/specific/euler/EulerProtocolView.tsx`
- **Problem:** Lines 263–282 in AaveFork and similar blocks in Venus/Compound/Euler all implement the same logic for generating collateral breakdown from positions and reserve configs. This is a generic pattern that should be centralized.
- **Fix:** Extract helper function `createCollateralBreakdown(activeSupply: ProtocolPosition[], reserveConfigs: ReserveConfig[]): CollateralBreakdownItem[]` in `packages/nextjs/utils/protocolViewHelpers.ts`. Handle both lowercase and non-lowercase address comparisons transparently. Use in all four protocol views. Reduces duplicate logic.

### Inline UTXO tracking logic duplicated across flow builders `[medium/M/~80 LOC]`
- **Files:** `hooks/kapan-router/useTransactionBuilder.ts`
- **Problem:** Multiple flow builders (buildCollateralSwapFlow, buildMultiplyFlow, buildCloseWithCollateralFlow, buildDebtSwapFlow) reimplement manual UTXO index tracking with comments documenting expected output layout. Each flow has 10-30 lines of comments explaining UTXO indices. This pattern is error-prone and hard to refactor—a change to one flow's output structure could silently break index references.
- **Fix:** Create a UTXOTracker abstraction that manages instruction-to-output mappings: class UTXOTracker { track(inst, outputCount), getIndex(pointer), validate() }. Flows call tracker.track() after adding instructions, avoiding manual index bookkeeping. Or create a builder class that returns both instructions AND a utxoMap automatically. This centralizes UTXO validation and makes the flows more readable.

### PendingOrdersDrawer and app/orders/page.tsx duplicate order-rendering logic `[high/M/~80 LOC]`
- **Files:** `components/common/PendingOrdersDrawer.tsx`, `app/orders/page.tsx`
- **Problem:** PendingOrdersDrawer (lines 115-180, 586-893) contains helper functions and order-item rendering (renderOrderItem) that decode conditional orders, extract protocol names, render badges, LTV info, and limit-price details. This same logic appears in app/orders/page.tsx (~86 duplicated lines per jscpd). Both files:
  - Decode limit-price trigger params identically (decodeLimitPriceTriggerParams)
  - Map protocol IDs to names (getProtocolNameFromId)
  - Render order type badges (getOrderTypeMetadata)
  - Display LTV/limit-price info in the same card layout
  - Filter/categorize orders by type (adl, autoLeverage, limit, unknown)

This violates DRY: a bug fix to limit-price decoding or order categorization requires changes in two places.
- **Fix:** Create `/packages/nextjs/utils/orders/orderHelpers.ts` exporting: `decodeLimitPriceTriggerParams()`, `getProtocolNameFromId()`, `getOrderTypeMetadata()`, `resolveOrderProtocol()`, and an `OrderItemRenderer` React component that accepts a ConditionalOrder and renders its card. Both PendingOrdersDrawer and orders/page.tsx import and use these shared utilities, eliminating ~80 LOC of duplication.

### Duplicate ScrambleText component across about and info pages `[high/S/~80 LOC]`
- **Files:** `app/about/AboutPageContent.tsx`, `app/info/InfoPageContent.tsx`
- **Problem:** ScrambleText (lines 46-128 in about, lines 21-101 in info) is near-identical code defining the same animated text reveal effect. The About version (lines 63, 76, 84, 121) checks 5 punctuation marks (, , ", ", ') while Info checks only 2 (, .). Both are unused in the About version's extra checks. ~80 LOC duplication.
- **Fix:** Extract ScrambleText into shared component at packages/nextjs/components/landing/ScrambleText.tsx. Export from both pages. Standardize on 2-punctuation check (space, dot) which covers all actual usage.

### TokenIcon component reimplemented instead of using existing shared TokenDisplay.TokenIcon `[medium/S/~75 LOC]`
- **Files:** `components/specific/euler/EulerMarketsSection.tsx`, `components/specific/morpho/MorphoMarketsSection.tsx`, `components/specific/compound/CompoundMarketsSection.tsx`
- **Problem:** All three MarketsSection files define their own TokenIcon (Euler 93-127, Morpho 186-220, Compound 53-88) when a robust production-grade TokenIcon already exists at components/common/TokenDisplay.tsx (lines 55-130) with more features: customSize override, fallback handling, rounded variants, showContainer option. Reinvented wheels diverge in API.
- **Fix:** Replace all three TokenIcon implementations with imports from TokenDisplay. Update call sites to use standardized API (size=sm/md/lg instead of size=20). Saves 75 LOC total and ensures consistent icon rendering.

### Duplicate helper functions in useADLOrder and useAutoLeverageOrder hooks `[high/M/~65 LOC]`
- **Files:** `hooks/useADLOrder.ts`, `hooks/useAutoLeverageOrder.ts`
- **Problem:** Both hooks define identical helper functions (assertWalletConnected, assertPublicClient, assertContractDeployed, assertAddressMatch, executeAuthCalls, extractOrderHashFromLogs, ensureRouterDelegation) with exact same logic. This creates a violation of DRY principle and makes maintenance harder. Lines 63-253 in useADLOrder match lines 68-310 in useAutoLeverageOrder structurally, totaling ~65 lines of duplicated helper code.
- **Fix:** Extract all these helpers into a shared utility module: `packages/nextjs/utils/conditionalOrderHelpers.ts` containing: createOrderAssertions(), executeAuthCalls(), extractOrderHashFromLogs(), ensureRouterDelegation(). Both hooks should import and reuse these.

### RefinanceModalEvm duplicates context resolution patterns from adlAutomationHelpers `[medium/M/~60 LOC]`
- **Files:** `components/modals/RefinanceModalEvm.tsx`, `components/modals/adlAutomationHelpers.ts`
- **Problem:** RefinanceModalEvm (lines 155-190) implements `resolveDestContext` and `resolveSourceCtx` to build per-collateral Euler contexts. This mirrors the per-vault logic in ADL's context handling. Both walk through vault/market arrays to match collaterals. Code is nearly parallel but lives in different places.
- **Fix:** Extract Euler context builder into shared utility: `packages/nextjs/utils/euler/buildEulerContextMap.ts`. Export function `buildEulerCollateralContexts(params: { vaultsByCollateral: Record<string, Vault[]>; selectedVault: string; subAccountIndex: number; collaterals: Collateral[]; addedCollaterals: Record<string, string> }): Record<string, EulerVaultContextForEncoding>`. Use in both RefinanceModalEvm and future ADL-Euler integrations. Estimate: 50 shared LOC, ~40 removed from RefinanceModalEvm.

### Filter bar and search icon boilerplate repeated across market sections `[medium/S/~50 LOC]`
- **Files:** `components/specific/euler/EulerMarketsSection.tsx`, `components/specific/morpho/MorphoMarketsSection.tsx`
- **Problem:** Both files define SEARCH_ICON_SIZE and ICON_BUTTON_ARIA_LABEL, then duplicate search filter bar UI (Euler 957-1010, Morpho 1139-1198) with 90% identical Radix TextField plus SearchableSelect layout. Only substantive difference is specific filter options, not UI scaffold.
- **Fix:** Create reusable MarketFilterBar component accepting search state and filter configs. Reduces both files' filter bar boilerplate to single component call.

### Vesu V1/V2 merge and loading state logic duplicated `[high/S/~50 LOC]`
- **Files:** `hooks/useVesuLendingPositions.ts`, `hooks/useVesuV2LendingPositions.ts`
- **Problem:** Both hooks (V1: lines 98-156, V2: lines 172-230) have nearly identical logic: error logging loop, mergedUserPositions useMemo, isLoading/isFetching/error extraction, usePositionLoadingState call, refetchPositions callback, and position caching. Only variable names differ (poolId vs normalizedPoolAddress).
- **Fix:** Extract shared `useVesuPositionsState(parts, userAddress, poolIdOrAddress)` hook that encapsulates the entire loading state machine, returning `{ cachedPositions, refetchPositions, hasLoadedOnce, isUpdating, isLoadingPositions, error }`. Reduces code duplication and centralizes loading logic.

### Duplicate limit price decoding and protocol ID mapping in orders page `[medium/S/~50 LOC]`
- **Files:** `app/orders/page.tsx`
- **Problem:** decodeLimitPriceTriggerParams (inline, lines 40-80) and getProtocolNameFromId (inline, lines 84-92) are utility functions that should be in a shared module but are embedded in the component. No other file imports these. If [orderHash]/page.tsx also needs this, it's duplicated.
- **Fix:** Extract to utils/orderDecoding.ts or utils/cow/orderDecoding.ts. Export decodeLimitPriceTriggerParams, getProtocolNameFromId. Import in orders/page.tsx and [orderHash]/page.tsx.

### Swap router fallback resolution reimplemented in two files `[medium/S/~40 LOC]`
- **Files:** `components/modals/common/useCollateralSwapConfig.tsx`, `components/modals/common/useClosePositionConfig.tsx`
- **Problem:** resolveSwapRouter (useCollateralSwapConfig:238–262) and resolveSwapRouterFallback (useClosePositionConfig:130–149) are near-identical fallback-selection logic using same lookup-table pattern. Only cosmetic naming differs. useDebtSwapConfig uses a helper from debtSwapHelpers.ts (resolveAvailableRouter).
- **Fix:** Consolidate into single 'swapRouterUtils.ts': export resolveSwapRouter(current, kyber, oneInch, pendle) → SwapRouter. Use in all three hooks and SwapModalShell. Already attempted in debtSwapHelpers but not reused everywhere.

### PositionMetrics interface and EMPTY_METRICS object redefined in 5 protocol views `[medium/S/~40 LOC]`
- **Files:** `components/specific/common/AaveForkProtocolView.tsx`, `components/specific/venus/VenusProtocolView.tsx`, `components/specific/compound/CompoundProtocolView.tsx`, `components/specific/euler/EulerProtocolView.tsx`, `components/specific/morpho/MorphoProtocolView.tsx`
- **Problem:** Each protocol view locally defines `interface PositionMetrics { netBalance, netYield30d, netApyPercent, totalSupplied?, totalBorrowed?, ...protocol-specific fields }` and `const EMPTY_METRICS = { ... }`. While field counts vary slightly (Morpho adds positionCount, Euler adds positionsWithDebt), the core 5 fields are universal. This creates 5 copies of nearly-identical type definitions.
- **Fix:** Create `packages/nextjs/types/protocolMetrics.ts` with a base `BasePositionMetrics` interface containing the universal fields. Each protocol can extend it with protocol-specific fields (optional pattern). Define generic `createEmptyMetrics<T extends BasePositionMetrics>()` helper. This eliminates duplication while preserving type flexibility.

### Duplicate formatting utilities: formatAmount, formatUsd in order detail page `[medium/M/~35 LOC]`
- **Files:** `app/orders/[orderHash]/page.tsx`, `utils/formatNumber.ts`
- **Problem:** formatAmount (lines 39-44), formatAmountPrecise (lines 46-55), formatUsd (lines 57-60) are locally defined in [orderHash]/page.tsx but similar logic exists in utils/formatNumber.ts (formatNumber, formatCurrency, formatCurrencyCompact, formatUsd). The page's formatAmount uses bigint+decimals pattern while utils use raw numbers—no reuse despite overlapping intent.
- **Fix:** Create utils/formatAmount.ts for bigint formatting helpers (formatAmount, formatAmountPrecise, formatUsdFromAmount). Import into both [orderHash]/page.tsx and any other pages needing token amount display.

### Vesu V1/V2 window pagination loop duplicated across both hooks `[high/S/~31 LOC]`
- **Files:** `hooks/useVesuLendingPositions.ts`, `hooks/useVesuV2LendingPositions.ts`
- **Problem:** Both useVesuLendingPositions (lines 65-96) and useVesuV2LendingPositions (lines 128-170) contain hardcoded 5-call pagination pattern for get_all_positions_range with identical window boundaries [0,2], [2,4], [4,6], [6,8], [8,10]. Only difference is contractName (VesuGateway vs VesuGatewayV2) and pool param type (poolId bigint vs poolAddress string).
- **Fix:** Extract shared helper `useVesuPositionsPaginated(contractName, userAddress, pool, watch)` that returns `{ parts, mergedPositions, isLoading, isFetching, error, refetch }`. This eliminates the hard-coded loop duplication while allowing protocol version parameterization.

### State management for collateral/debt input is partially duplicated across modals `[medium/S/~30 LOC]`
- **Files:** `components/modals/MultiplyEvmModal.tsx`, `components/modals/RefinanceModalEvm.tsx`
- **Problem:** Both components independently manage: debt input (amount, max, confirmation), collateral selection (expandedCollateral, tempAmount, addedCollaterals). RefinanceModalEvm uses `useMovePositionState` (shared hook) but MultiplyEvmModal reimplements state locally. Pattern is similar but not reused.
- **Fix:** MultiplyEvmModal should use or extend `useMovePositionState` for collateral/debt management instead of inline useState. This centralizes the pattern and reduces MultiplyEvmModal further. Evaluate whether debt confirmation logic can be shared across both.

### positionToSwapAsset helper duplicated across protocol views `[high/S/~28 LOC]`
- **Files:** `components/specific/common/AaveForkProtocolView.tsx`, `components/specific/venus/VenusProtocolView.tsx`
- **Problem:** Lines 63-76 in AaveFork and 45-58 in Venus are identical 14-line functions converting ProtocolPosition -> SwapAsset. Both are locally defined, not exported or shared. Any fix to one won't propagate; any refactor of ProtocolPosition breaks both independently.
- **Fix:** Extract `positionToSwapAsset` to a new shared utility file `packages/nextjs/utils/protocolViewHelpers.ts` and export it. Import in both AaveFork and Venus, and in any other protocol view that needs it (Compound, Euler, Morpho, Alchemix likely use similar conversions). This centralizes the transformation logic.

### Vesu asset set building duplicated (assetMap/collateralSet/debtSet) `[medium/S/~25 LOC]`
- **Files:** `hooks/useVesuAssets.ts`, `hooks/useVesuV2Assets.ts`
- **Problem:** Both hooks build identical Map and Set data structures from assets (lines 145-171 in V1, 285-312 in V2). The toHex helper differs slightly (V2 handles string input), but core pattern is the same: map.set(toHexAddress(asset.address), asset) for assetMap, and set construction from collateral/debt arrays.
- **Fix:** Extract shared `buildAssetMaps(assetsWithRates, supportedCollaterals, supportedDebts, toHexFn)` utility that returns `{ assetMap, collateralSet, debtSet }`. Consolidate toHex normalization (bigint→hex, string→lowercase) into a single flexible helper.

### Duplicate LaunchAppButton (About vs Info pages) `[low/S/~25 LOC]`
- **Files:** `app/about/AboutPageContent.tsx`, `app/info/InfoPageContent.tsx`
- **Problem:** About page embeds Launch App button logic in CTAContent (lines 416-430). Info page extracts LaunchAppButton component (lines 145-175) but identical. ~30 LOC duplication across different patterns.
- **Fix:** Create shared packages/nextjs/components/landing/LaunchAppButton.tsx. Import in both AboutPageContent and InfoPageContent.

### Morpho, Alchemix, and other protocols re-implement header metric building with same pattern `[low/S/~20 LOC]`
- **Files:** `components/specific/morpho/MorphoProtocolView.tsx`, `components/specific/alchemix/AlchemixProtocolView.tsx`
- **Problem:** Both define `headerMetrics: HeaderMetric[]` via identical `useMemo(() => [{label, value, type}, ...], [deps])`. The structure is always the same: currency + apy + custom metric. Minor differences in which metrics are included (Morpho adds Positions count, Alchemix adds debt).
- **Fix:** Provide a builder utility `createHeaderMetrics({balance, yield30d, netApy, customMetric?}): HeaderMetric[]` in `packages/nextjs/utils/protocolMetrics.ts`. Allows `const headerMetrics = useMemo(() => createHeaderMetrics({balance: metrics.netBalance, ...}), [metrics])` in one line across all protocols.

### Repeated token-amount formatting logic across components `[medium/S/~15 LOC]`
- **Files:** `components/common/PendingOrdersDrawer.tsx`, `components/common/AmountDisplay.tsx`
- **Problem:** PendingOrdersDrawer (lines 171-180) defines `formatTokenAmount()` and `formatLimitPrice()` that use identical logic to AmountDisplay.tsx (lines 24-89) and common utils: adaptive decimal precision (0.0001→8 decimals, 0.01→6, 1→5, 1000+→4). PendingOrdersDrawer reimplements this locally instead of importing `formatTokenAmount` from AmountDisplay.tsx, leading to inconsistent formatting behavior and maintenance burden if precision thresholds change.
- **Fix:** PendingOrdersDrawer should import `{ formatTokenAmount }` from `./AmountDisplay.tsx` instead of reimplementing it locally. Move `formatLimitPrice()` to AmountDisplay.tsx as `formatExchangeRate()` since it's the same pattern (adaptive decimals for ratios). This is a ~15 LOC consolidation with zero behavioral change.

## God files to decompose (14)

### useCollateralSwapConfig bloated with conditional-order + market-order builders
- **Files:** `components/modals/common/useCollateralSwapConfig.tsx`
- **Problem:** Single 2183-line hook mixes: state management, quote fetching, Morpho/Euler/Aave protocol detection & context encoding, conditional-order instruction building (buildMorphoConditionalWithDebt, buildMorphoConditionalNoDebt, buildEulerConditionalInstructions, buildStandardConditionalInstructions, appendDustClearingInstructions), market-order instruction building (buildMorphoMarketFlow, buildEulerMarketFlow, encodeSwapContext, buildBaseMarketInstructions), UI config assembly. Cognitive complexity: 60+ nested conditions, 15 helper functions, 8 useMemo blocks with 30+ deps each.
- **Split plan:** Extract instruction builders into 'collateralSwapInstructions.ts': export { buildConditionalOrderInstructions, buildMarketOrderInstructions } parametrized by protocol (morpho|euler|standard), flow (with-debt|no-debt|dust-clearing). Reduce hook to state + coordination logic. Related: extract common Morpho/Euler context encoding into 'protocolContextHelpers.ts' (encodeMorphoContext, encodeEulerContext already exist but should centralize context *building* logic too).

### useClosePositionConfig & useDebtSwapConfig both exceed 2000 LOC with similar structure
- **Files:** `components/modals/common/useClosePositionConfig.tsx`, `components/modals/common/useDebtSwapConfig.tsx`
- **Problem:** Both hooks (2007 & 1371 LOC) mix: asset setup, quote logic (unit quote + swap quote), flash loan setup, Euler context encoding, conditional-order instruction building, market-order flow building, transaction submission (handleMarketSubmit, handleLimitOrderSubmit), cost breakdowns. Helper functions extracted to debtSwapEvmHelpers.tsx & closeWithCollateralEvmHelpers.tsx but core hook remains monolithic.
- **Split plan:** Further refactor into smaller composable hooks: (1) useAssetSetup (fromAsset, toAssets, selectedFrom/To, effects), (2) useQuoteAndExchangeRate (unit quote + swap quote + required collateral/debt), (3) useConditionalOrderInstructions (builder logic), (4) useTransactionSubmission (market + limit order submit). Root hook assembles config from these sub-hooks.

### MultiplyEvmModal is a monolithic god component (1840 LOC)
- **Files:** `components/modals/MultiplyEvmModal.tsx`
- **Problem:** MultiplyEvmModal handles multiple concerns: state management (16 useState calls), quote fetching (oneInch, Pendle, CoW), execution flow (flash loan vs limit order), instruction building, UI rendering, and analytics. Deep nesting (slider, deposit/borrow sections, limit order pricing, config grid). Lines 779-960 contain complex limit order logic (validation, order building, execution, receipt handling).
- **Split plan:** Extract into focused sub-components:
1. `ExecutionTypeSection` (lines 1380-1416): market vs limit tabs + pricing section
2. `LimitOrderSubmitHandler` (lines 799-933): all conditional order logic → custom hook `useLimitOrderSubmit()`
3. `MarketOrderSubmitHandler` (lines 937-960): market order logic → custom hook `useMarketOrderSubmit()`
4. `QuoteManagement` hook: centralize ref handling + quote updates (lines 397-450)
5. Create `ConfigurationPanel` component for slippage/router/zap/FL provider selectors
Move UI sub-components (DepositSection, BorrowSection, LeverageSection) to separate files. Current file: 1840 LOC → target: ~600 LOC component + hooks.

### useTransactionBuilder.ts is a monolithic 1211-line flow builder with mixed concerns
- **Files:** `hooks/kapan-router/useTransactionBuilder.ts`
- **Problem:** Single file implements 11 distinct flow builders (buildDepositFlow, buildBorrowFlow, buildDepositAndBorrowFlow, buildRepayFlow, buildRepayFlowAsync, buildWithdrawFlow, buildCollateralSwapFlow, buildMultiplyFlow, buildCloseWithCollateralFlow, buildDebtSwapFlow, createMoveBuilder) plus 3 parameter/return types. Each flow builder is 50-200 lines with nested logic (Alchemix special casing in buildMultiplyFlow: lines 554-646, ~90 lines; complex UTXO tracking in buildCollateralSwapFlow: lines 360-509, ~150 lines). The file mixes parameter types, handler logic, and output state management. Searching for a specific flow requires parsing 1200 lines.
- **Split plan:** Split into focused modules: (1) `baseFlows.ts` - simple atomic flows (Deposit, Borrow, Repay, Withdraw), (2) `complexFlows.ts` - multi-step flows (CollateralSwap, Multiply, CloseWithCollateral, DebtSwap), (3) `advancedFlows.ts` - builder patterns (MoveFlowBuilder), (4) `types.ts` - all parameter and return types. Re-export from `index.ts` for backward compatibility. This reduces any single file to <500 lines and makes each flow unit-testable.

### EulerProtocolView at 1153 lines: oversized due to per-position-group modal state and complex multi-modal rendering
- **Files:** `components/specific/euler/EulerProtocolView.tsx`
- **Problem:** Unlike Aave/Venus (cross-topology, one position group), Euler uses sub-accounts (one group per debt position). Main component manages 3 modal state interfaces (lines 68–160) with init objects, plus EulerPositionGroupRow sub-component (400+ lines) handling 5 modals per group. Nesting: main -> Map EulerPositionGroupRow -> each renders 5 modals. Modal state spread across parent + child.
- **Split plan:** Extract modal state management to per-group custom hook `useEulerGroupModals()` returning {swapState, debtSwapState, closeState, handlers}. Move into EulerPositionGroupRow hook wrapper. Break EulerPositionGroupRow further: <EulerPositionCards> (renders SupplyPosition + BorrowPosition), <EulerGroupModals> (renders 5 modals), helper `createEulerCollateralBreakdown()`. Target: EulerPositionGroupRow <300 lines, main <400 lines, total ~700.

### multiplyEvmHelpers is oversized (1188 LOC) and contains unrelated concerns
- **Files:** `components/modals/multiplyEvmHelpers.ts`
- **Problem:** File bundles three distinct domains:
1. Quote analysis (getBestQuote, calculateQuotesPriceImpact, ~100 LOC)
2. Position metrics (calculatePositionMetrics, calculateNetApyAndYield, calculateFeeBreakdown, ~200 LOC)
3. Instruction/flow building (buildCowChunkInstructions, buildInitialDepositInstructions, buildFlashLoanModeChunks, ~250 LOC)
4. Leverage/LTV math (calculateMaxLeverageFromLtv, adjustMaxLeverageForSlippage, calculateFlashLoanAmount, ~100 LOC)
5. UI formatters (formatLtvDisplay, formatApyDisplay, formatPriceDisplay, ~50 LOC)
6. Adapter resolution and swap routing (resolveActiveAdapter, resolveSwapDataForFlow, ~60 LOC)
Each domain is independently useful elsewhere but bundled.
- **Split plan:** Split into domain-specific files:
- `quoteAnalysis.ts`: getBestQuote, calculateMarketRate, calculateQuotesPriceImpact (~80 LOC)
- `positionMetrics.ts`: calculatePositionMetrics, calculateNetApyAndYield, calculateFeeBreakdown, calculateMinCollateralOut (~150 LOC)
- `instructionBuilding.ts`: buildCowChunkInstructions, buildFlashLoanModeChunks, buildMultiChunkModeChunks, buildInitialDepositInstructions, buildPreOrderInstructions, createSeedBorrowInstruction (~250 LOC)
- `leverageCalculation.ts`: calculateMaxLeverageFromLtv, adjustMaxLeverageForSlippage, calculateFlashLoanAmount, calculateFlashLoanChunkParams (~120 LOC)
- `formatters.ts`: formatLtvDisplay, formatApyDisplay, formatPriceDisplay, formatYield30dDisplay, getApyColorClass (~50 LOC)
- `swapResolution.ts`: resolveActiveAdapter, resolveSwapDataForFlow, mapSwapRouterToFlowParam, resolveSwapRouterFallback (~80 LOC)
Keep only orchestration/exports in multiplyEvmHelpers.ts (~100 LOC). Total saved through split: clarity + easier testing.

### RefinanceModalEvm combines modal logic with complex state + execution orchestration (1136 LOC)
- **Files:** `components/modals/RefinanceModalEvm.tsx`
- **Problem:** Component manages: collateral hook fetching (lines 295-450), price merging (lines 303-327), Morpho market support (lines 431-454), Euler vault support (lines 456-503), health factor computation (lines 755-815), move builder orchestration (lines 919-1052), plus full RefinanceModalContent rendering. handleExecuteMove (lines 919-1052) is 133 lines with nested context resolution, flow building, simulation, and execution.
- **Split plan:** Extract execution logic into custom hook `useRefinanceMoveExecution()` (lines 919-1052 → separate file):
```typescript
function useRefinanceMoveExecution(params: { debtConfirmed; selectedProtocol; ... }) {
  const { createMoveBuilder, executeFlowBatchedIfPossible, simulateInstructions } = useKapanRouterV2();
  // ... context resolution, builder logic, execute...
  return { handleExecuteMove, batchingUsed };
}
```
Keep component as coordinator of hooks + render. Estimate: ~200 LOC extracted, file shrinks to ~850 LOC.

### AaveForkProtocolView at 626 lines: oversized with intermingled concerns (config, data-fetch, modal state, metrics, render)
- **Files:** `components/specific/common/AaveForkProtocolView.tsx`
- **Problem:** Single file houses config interfaces (45 lines), helper (14 lines), main component logic with 16+ state variables, 12+ useMemo blocks (150+ lines), modal state (80 lines), and JSX render (180 lines). No sub-components to organize concerns. Cognitive complexity is high.
- **Split plan:** Decompose into: (1) AaveForkProtocolView.tsx (main, 150 lines): config interfaces, component wrapper, call hooks. (2) hooks/useAaveForkMetrics.ts (100 lines): useMemo blocks for metrics, collateralBreakdown, utilization. (3) hooks/useAaveForkModalState.ts (80 lines): useState for modals, event handlers, footers. (4) Sub-components: <AaveForkHeader>, <AaveForkPositions>, <AaveForkModals> (90 lines each) to segment JSX rendering. Target: each file <150 lines, single responsibility.

### BasePosition component is oversized (650 LOC) with complex layout logic
- **Files:** `components/common/BasePosition.tsx`
- **Problem:** BasePosition.tsx (650 LOC) combines: position-data normalization, state management (expansion toggle), layout branching (mobile <md vs desktop ≥md), stat-column building, render logic for icon/name/balance/rate/yield/extra-stats, and action bars. The desktop layout (lines 550-590) and mobile layout (lines 487-548) are independent branches with mostly parallel structure. Deeply nested: container (lines 472-615) → mobile/desktop branchers → stat grid/columns → individual stat renders. Three sub-components (ExpandIndicator, BalanceDisplay, TokenNameContent) are inlined.
- **Split plan:** Extract layout rendering into `/common/BasePosition/Desktop.tsx` and `/common/BasePosition/Mobile.tsx` receiving {icon, name, balanceDisplay, statColumns, actions, etc.}. Move sub-components to `/common/BasePosition/ExpandIndicator.tsx`, `BalanceDisplay.tsx`, `TokenNameContent.tsx` as separate exports. This reduces BasePosition to ~250 LOC orchestrating composition and data calculation; moves visual logic to focused layout files. Also extract `buildStatColumns()` to a separate `statColumnBuilder.ts` utility (~75 LOC).

### useEulerLendingPositions is oversized at 987 LOC with deeply nested liquidity logic
- **Files:** `hooks/useEulerLendingPositions.ts`
- **Problem:** Hook contains 15+ useMemo blocks with complex state machine: position group enrichment (lines 751-795), balance parsing (lines 720-750), liquidity parsing (lines 700-720), row transformation (lines 797-877). The interdependencies between liquidityMap, balanceMap, convertedAssetsMap, and enrichedPositionGroups create cognitive load. Helper functions (parseLiquidityForGroup, processBalanceEntry) partially mitigate but core logic remains monolithic.
- **Split plan:** Extract liquidity enrichment into a separate `useLiquidityCalculator(positionGroups, liquidityResults, balanceMap)` hook returning enriched groups. Move balance parsing logic to `useBalanceMap(balanceResults, balanceContracts, convertResults)` hook. This splits the 250+ LOC of on-chain data aggregation from the 200+ LOC of position row transformation.

### CompoundProtocolView at 881 lines: per-market modal duplication scales poorly
- **Files:** `components/specific/compound/CompoundProtocolView.tsx`
- **Problem:** Compound's market-per-row design (CompoundMarketRow component, ~200 lines each) creates duplicate modal state per market. When a user has 5 markets, 5 copies of modal state exist in memory and are rendered in JSX (deposit, withdraw, borrow, swap, ADL modals per market). No de-duplication; scales poorly and inflates component tree.
- **Split plan:** Implement a modal registry pattern: main component manages a single swap modal + single ADL modal + single borrow modal. Each CompoundMarketRow calls `useModalContext()` to register its market, triggering a shared modal with correct market context pre-filled. Reduces modal count from O(n) to O(1). Alternatively, extract modal state to sub-hook `useCompoundMarketModals(market)` returning {handlers, isOpen} but no JSX.

### EulerMarketsSection at 1137 LOC combines shared UI, row types, table defs, and state management
- **Files:** `components/specific/euler/EulerMarketsSection.tsx`
- **Problem:** File mixes: (1) shared UI components (TokenIcon, SearchableSelect, CollateralStack, CategoryButton, OptionButton) lines 93-410, (2) row type definitions and mobile rendering (VaultRow, MobileVaultRow, MobileVaultRowItem) lines 65-607, (3) table setup with 30+ column definitions lines 700-806, (4) filter state management and data transformation lines 617-697, (5) main component logic. No clear internal boundaries make editing risky.
- **Split plan:** Split into: (1) MarketComponentLibrary.tsx (shared UI), (2) EulerMobileVaultRow.tsx (mobile rendering), (3) EulerMarketColumns.ts (column definitions), (4) EulerMarketsSection.tsx (main container). Each module becomes less than 400 LOC and testable.

### MorphoMarketsSection at 1331 LOC combines shared UI, row types, table defs, modal plumbing, and loop APY calculation
- **Files:** `components/specific/morpho/MorphoMarketsSection.tsx`
- **Problem:** File mixes: (1) shared UI components lines 139-510, (2) row types and mobile rendering lines 104-643, (3) table setup with 40+ column definitions lines 776-897, (4) filter state and data transformation lines 646-772, (5) loop modal plumbing lines 1037-1114, (6) main component logic. Protocol-specific logic (calculateMaxLoopApy lines 91-101) embedded in render file.
- **Split plan:** Split into: (1) MarketComponentLibrary.tsx, (2) MorphoMobileMarketRow.tsx, (3) morphoUtils.ts (calculateMaxLoopApy and row transformation), (4) MorphoMarketColumns.ts, (5) MorphoMarketsSection.tsx. Each module less than 400 LOC. Extract calculateMaxLoopApy to utils as it is protocol-specific logic.

### utils/cow/appData.ts is oversized with mixed concerns (916 LOC)
- **Files:** `utils/cow/appData.ts`
- **Problem:** Single file handles: type definitions (CowHook, FlashLoanMetadata, AppDataDocument), appCode building/parsing (buildAppCode, parseOperationTypeFromAppCode, parseProtocolFromAppCode), ABI encoding (encodeBorrowerApprove, encodeTokenTransfer, encodeAdapterFundOrder*), hook building (encodePreHookCall, encodePostHookCall), full appData composition (buildKapanAppData), hashing, API registration (registerAppData, buildAndRegisterAppData), flash loan helpers. 20+ exported functions. Concerns: schema def -> encoding -> composition -> API I/O.
- **Split plan:** Split into: (1) appData/types.ts (interfaces, types, constants), (2) appData/encode.ts (ABI encoding functions: encodeBorrowerApprove, encodeTokenTransfer, encodeAdapterFundOrder*, encodePreHookCall, encodePostHookCall), (3) appData/build.ts (buildKapanAppData, buildFlashLoanOptions), (4) appData/api.ts (registerAppData, buildAndRegisterAppData, fetchAppData, fetchOperationTypeFromAppData), (5) appData/codec.ts (buildAppCode, parseOperationTypeFromAppCode, parseProtocolFromAppCode, normalizeProtocolForAppCode). Update cow/index.ts re-exports.

## Type-safety & bug-risk (9)

- **[bug-risk/medium]** useWalletSwapConfig missing executionType setter; disabled but unchecked — components/modals/common/useWalletSwapConfig.tsx
  - Line 637–638: setExecutionType is a no-op function (/* eslint-disable-next-line */ → () => {}). SwapModalShell may pass this to child components that expect functional setters. If a future refactor adds execution-type UI to wallet swaps, this will silently fail. No error boundary.
  - Fix: If wallet swaps never support limit orders, export a DISABLED_EXECUTION_TYPE constant; document in types. If they might in future, implement proper state. Better: use discriminated union SwapOperationConfig['executionType'] = 'market' (literal, not union).
- **[typesafety/low]** Protocol name normalization scattered; normalizeProtocolName applied inconsistently — components/modals/common/useCollateralSwapConfig.tsx, components/modals/common/useDebtSwapConfig.tsx, components/modals/common/useClosePositionConfig.tsx
  - Each hook manually detects protocol via isMorpho = protocolName.toLowerCase().includes('morpho'), then normalizes later with normalizeProtocolName(). No single source of truth. Risk: typo in string check ('morpho' vs 'MORPHO' vs 'Morpho-Blue') breaks detection.
  - Fix: Create 'protocolUtils.ts': export { detectProtocol(name): 'morpho'|'euler'|'aave'|... } using normalizeProtocolName internally. Replace all isMorpho/isEuler checks with const protocol = detectProtocol(protocolName); const isMorpho = protocol === 'morpho'.
- **[typesafety/medium]** RefinanceModalEvm uses loose type for collateral metadata with optional fields — components/modals/RefinanceModalEvm.tsx
  - Line 748 defines interface `CollateralForHF` with optional fields (address?, token?, rawBalance?, decimals?), then uses it in `computeHF` (line 755+) with fallback logic (e.g., `addrKey(c.address || c.token || '')`, `c.rawBalance ?? 0n`). This masks type errors; should validate up-front.
  - Fix: Replace optional fields with separate overloads or a discriminated union. Validate collateral data before calling `computeHF`. Ensure address is never undefined by contract.
- **[bug-risk/medium]** RefinanceModalEvm eulerContextsByCollateral memoization depends on indirect state (isLoadingEulerSubAccount) — components/modals/RefinanceModalEvm.tsx
  - Lines 515-578: useMemo for eulerContextsByCollateral includes `isLoadingEulerSubAccount` in dependencies and has early return (line 523) if loading. However, eulerRefinanceSubAccount hook itself is not in dependencies. If the hook updates while loading changes, context may become stale. Logic is fragile: early exit assumes data is invalid, but calling code may use stale context.
  - Fix: Add explicit guard before using eulerContextsByCollateral (check loading state in caller). Alternatively, track readiness state separately from contexts. Simplify by waiting for all data before building contexts.
- **[bug-risk/low]** Unsafe casts in protocol-specific data fetchers (Venus, Compound) use `chainId as any` — components/specific/venus/VenusProtocolView.tsx, components/specific/compound/CompoundProtocolView.tsx
  - Lines like `useScaffoldContract({ contractName: "VenusGatewayView", chainId: chainId as any })` bypass TypeScript type checking on chainId. If chainId is undefined or a wrong type, the error is silent.
  - Fix: Define explicit type: `const chainId: number | undefined = propChainId || walletChainId || 42161;` then remove the `as any` cast. If hook requires `number`, provide a fallback default upfront, not via cast.
- **[typesafety/medium]** Unsafe type assertions and missing null guards in row transformation — components/specific/morpho/MorphoMarketsSection.tsx
  - Line 693-702: toNumberSafe called on potentially undefined values (m.loanAsset?.decimals, m.state?.supplyAssetsUsd) then immediately divided/multiplied without null guards. After filter at line 680, m.collateralAsset is guaranteed non-null but m.loanAsset is still optional. Should be required type or guarded explicitly.
  - Fix: Add guard at start of map block: if (!m.loanAsset) return null; or assert types in filter. Replace toNumberSafe with direct Number() where value is known safe.
- **[typesafety/high]** Unsafe `any` type cast in useVesuV2Assets position transformation — hooks/useVesuV2Assets.ts
  - Line 268: `return normalizedAssets.map((asset: any) => {...})` bypasses type checking for asset properties. normalizedAssets is already typed as TokenMetadata[], so the unsafe cast defeats static analysis. This masks potential runtime errors if asset shape differs.
  - Fix: Remove the `any` cast and let TypeScript infer the type from normalizedAssets. If asset shape differs from TokenMetadata, update the type definition or parsing function instead of masking it with `any`.
- **[typesafety/medium]** Unsafe 'as any' casts in orders/page.tsx for useDeployedContractInfo — app/orders/page.tsx
  - Lines 122, 124, 126 use `{ contractName: "...", chainId } as any` to bypass type checking. Hides type mismatches and makes refactoring risky. Should properly type hook params.
  - Fix: Replace `as any` with proper type annotation. If useDeployedContractInfo expects different shape, cast the result selectively (e.g., data as any | undefined for optional fields).
- **[typesafety/low]** Unsafe 'as Address' casts in orders/page.tsx tokenAddresses collection — app/orders/page.tsx
  - Lines 135-136 cast sellToken and buyToken `as Address` without validation. Should verify they are valid Address type before casting.
  - Fix: Validate token addresses or safely cast: isAddress(o.context.params.sellToken) ? ... : fallback.

## Perf & consistency (18)

- **[consistency/medium/S]** Modal component boilerplate nearly identical across V2 variants — components/modals/CollateralSwapModalV2.tsx
  - Create generic 'SwapModalBase<T extends SwapOperationConfig>': accepts configHook, props. Renders SwapModalShell with config spread. Reduces each modal to ~20 LOC (hook call + minimal wiring). Alternatively: higher-order component modalFactory(hook, propsAdapter).
- **[perf/medium/M]** Excessive dependency arrays in useMemo blocks cause re-renders despite stable config — components/modals/common/useCollateralSwapConfig.tsx
  - Wrap quote/protocol/router state in useReducer or context to stabilize identities. Memoize quote objects at fetch boundary (use1inchQuote, usePendleConvert already memoize, but comparison fails on object identity). For large useMemo deps: split into 3–5 smaller memos with stable atoms. Use useCallback for derived functions (handlers) instead of inline.
- **[perf/medium/S]** MultiplyEvmModal re-renders excessively due to quotesRef updates not memoized — components/modals/MultiplyEvmModal.tsx
  - Move quotesRef updates into useMemo that's properly dependency-tracked, or restructure to use state + useEffect callback pattern. Ensure useCallback handlers capture quote updates synchronously.
- **[consistency/medium/S]** Protocol normalization logic scattered across files with inconsistent implementations — components/modals/RefinanceModalEvm.tsx
  - Standardize on single `normalizeProtocolName` in instructionHelpers or shared utils. Ensure all three files import from same source. Add tests for edge cases ("Morpho Blue", "Morpho-Blue", "aave-v3", etc.).
- **[consistency/medium/S]** Inconsistent ADL/E-Mode toolbar rendering between AaveForkProtocolView and VenusProtocolView — components/specific/common/AaveForkProtocolView.tsx
  - Extend config to accept optional `eModeFetcher` hook and optional render function. If provided, include EModeToggle in toolbar; if not, omit it. AaveFork config provides the fetcher, Venus config omits it. This makes E-Mode support a pluggable feature, not a hardcoded branch.
- **[consistency/medium/S]** Protocol view naming inconsistency: Aave/Venus dedicated, Spark/ZeroLend wrap AaveFork, Uniswap/Aerodrome use LpProtocolView — components/specific/aave/AaveProtocolView.tsx
  - Adopt a file structure convention: Rename `AaveForkProtocolView.tsx` -> `CrossTopologyProtocolView.tsx`. Place Spark, ZeroLend, and future Aave forks in a shared `forks/` subdirectory, each a thin 32-line config wrapper. Document in README that cross-topology protocols (Aave, Venus, Morpho, Spark, ZeroLend) share this pattern. Same for LP protocols. Centralizes understanding.
- **[consistency/medium/S]** Inconsistent table sort icon handling: Euler custom vs Morpho TanStack API — components/specific/euler/EulerMarketsSection.tsx
  - Replace Euler's getSortIcon and isSorted utilities with inline header.column.getIsSorted() checks or simple helper SortIcon component.
- **[consistency/medium/M]** Divergent data sources for Vesu V1 vs V2 rates (on-chain vs API) — hooks/useVesuAssets.ts
  - Consolidate rate fetching into a single abstraction: `useLendingRates(poolId, poolAddress, fetchMode: 'on-chain'|'api')` that returns normalized borrowAPR/supplyAPY. Clarify which source is authoritative and add comments explaining rate derivation differences (V2 API may have incentives, V1 on-chain only has base utilization).
- **[perf/medium/S]** Missing useMemo on windows array definition in useVesuV2LendingPositions — hooks/useVesuV2LendingPositions.ts
  - Move windows outside the hook as a module-level const: `const VESU_POSITION_WINDOWS = [[0n, 2n], [2n, 4n], ...] as const`. Update comment to explain why width=2 was chosen (Starknet step budget). This clarifies intent and removes a trivial useMemo invocation.
- **[consistency/medium/S]** Inconsistent error handling between Vesu V1 and V2 position loading — hooks/useVesuLendingPositions.ts
  - Unify error handling to collect all errors into an array and expose a summary flag (e.g., `hasPartialError`). For V2Assets, consolidate ratesError and assetsError into a single error field with a clear precedence rule (e.g., 'assets error takes priority, then rates'). Document what behavior users should expect on partial failures.
- **[consistency/medium/S]** Inconsistent error handling and type safety across conditional order hooks — hooks/useADLOrder.ts
  - Create 'packages/nextjs/utils/orderErrorHandling.ts' exporting: (1) formatOrderError(error) with consistent user-facing messages, (2) shouldRetry(error) for transient failures, (3) logOrderError(error, context) for debugging. Create type guards: assertDeployedAddress(addr, name), assertHexString(data). Use consistently across all order hooks to reduce duplication and improve maintainability.
- **[perf/medium/S]** Potential stale authorization results in conditional order hooks due to missing dependencies — hooks/useADLOrder.ts
  - Add all external dependencies to useCallback dependency arrays: ensure 'getAuthorizations' is included in both hooks' createOrder callbacks. Alternatively, move authorization fetching outside the callback if it is state-independent. Consider using a deep-comparison memo to detect meaningful instruction changes vs. reference changes.
- **[perf/medium/S]** BasePosition creates new sub-component instances on every render — components/common/BasePosition.tsx
  - Memoize balanceProps object creation using useMemo (currently done line 434-444, but re-assignment happens in multiple branches). Extract ExpandIndicator/BalanceDisplay/TokenNameContent to separate files and memoize their instantiation. The bigger win: memoize buildStatColumns result via useMemo with proper dependency array (already done, but verify no stale closures).
- **[consistency/medium/S]** Inconsistent prop-drilling for position metadata across Supply/Borrow/LP — components/SupplyPosition.tsx
  - Create a shared `PositionComponentProps` base interface in `/common/BasePosition.tsx` with all common token/protocol fields. Extend it in Supply/Borrow/LP props: `SupplyPositionProps extends PositionComponentProps { availableActions?: {...}, ... }`. This centralizes the contract and makes it clear which props are shared vs position-specific. ~20 LOC refactor, zero behavioral change.
- **[consistency/medium/S]** Type-unsafe balanceProps object in BasePosition — components/common/BasePosition.tsx
  - Use the existing `BalanceDisplayProps` type to type-annotate balanceProps: `const balanceProps: BalanceDisplayProps = { ... }` (lines 434-444). This ensures at compile-time that the object matches the component's contract.
- **[perf/medium/S]** Missing memoization of trigger address constants in orders/page.tsx — app/orders/page.tsx
  - Wrap address derivation in useMemo: const triggerAddresses = useMemo(() => ({ auto: ..., limit: ..., ltv: ... }), [autoLeverageTriggerInfo, limitPriceTriggerInfo, ltvTriggerInfo]). Use single object in callback deps.
- **[perf/low/S]** Inline SVG in OrdersPage header re-renders on every order state change — app/orders/page.tsx
  - Extract to RefreshButton component or memoize SVG. Minor perf win.
- **[consistency/low/S]** ScrambleText punctuation handling inconsistent between about and info pages — app/about/AboutPageContent.tsx
  - Standardize on space + period (used by both). If About text needs commas/quotes preserved, update that text or extend list consistently.

## Dead code

**Verified-dead files (already deleted this session, tsc-clean):**
- `hooks/useOptimalRate.ts`, `components/home/HowItWorksScene.tsx`
- `components/specific/{aave/AaveMarkets, compound/CompoundMarkets, venus/VenusMarkets, nostra/NostraMarkets}.tsx` (old per-protocol Markets, superseded by `*MarketsSection`)
- `components/specific/zerolend/ZeroLendProtocolView.tsx` (superseded by AaveFork config), `utils/alchemix/index.ts` (unused barrel)

**Further dead-code leads (from knip — VERIFY each before deleting; knip over-reports):**
- ~703 unused exports, ~403 unused types, mostly **barrel-file bloat**: `components/modals/common/index.ts` (125 unused re-exports), `utils/cow/index.ts` (54), `components/modals/refinance/index.ts` (43), `hooks/kapan-router/index.ts` (36). Re-exporting everything hurts tree-shaking and creates false coupling; export only what's consumed across module boundaries.
- Unused utility functions in multiplyEvmHelpers.ts — components/modals/multiplyEvmHelpers.ts: Search codebase for actual usage. If truly unused, remove or document as internal helper. If internal, make private (remove export).
- Unused marketPairs prop in MorphoMarketsSection interface — components/specific/morpho/MorphoMarketsSection.tsx: Remove marketPairs from MorphoMarketsSectionProps and destructure. If reserved for future, document as TODO in issue tracker, do not keep unused types.
- useStarknetMovePositionLegacy exports and type exports suggest inactive code — hooks/useStarknetMovePositionLegacy.ts: Search the entire codebase for imports of useStarknetMovePositionLegacy. If none exist, remove the file. If imports exist, add a deprecation notice TSDoc comment directing users to useStarknetMovePosition. If the legacy version is a fallback for older Cairo contracts, document that clearly and keep it, but mark it as @deprecated.
- Unused optimalRateOverride prop in BasePosition — components/common/BasePosition.tsx: Remove the `optimalRateOverride` prop and its comment from BasePositionProps interface. Remove from destructure. Search for callers in SupplyPosition/BorrowPosition/LpPosition and remove from their calls—only BorrowPosition passes it (line 581, demoOptimalOverride).

## jscpd mechanical-duplication (1.81% overall — low; the real cost is structural above)
Top exact clones: `useADLOrder`↔`useAutoLeverageOrder`, `AaveForkProtocolView`↔`VenusProtocolView`, `useVesuAssets`↔`useVesuV2Assets`, the `*SwapModalV2` family, `PendingOrdersDrawer`↔`app/orders/page.tsx`, `about`↔`info` pages.

## Quick wins (each < ~1 hour, low regression risk)
- ✅ **Delete verified-dead files** — done this session (8 files, tsc-clean).
- **Fix the `any` casts** in `useVesuV2Assets` / position transforms (type-safety findings) — pure typing, no behavior change.
- **Consolidate `resolveSwapRouter`** into one `swapRouterUtils.ts` (3 near-identical copies) — small, self-contained.
- **Vesu V1/V2 pagination + merge dedup** — extract `useVesuPositionsBase`; the two hooks become thin wrappers (~80 LOC).
- **Barrel slimming** — stop re-exporting unused symbols from `modals/common/index.ts` etc. (verify each export's external use first).

## Sequencing (do in this order — earlier steps unblock later ones)
1. **Quick wins above** — safe, immediate, build momentum.
2. **Extract the shared swap core** — `useQuoteFetching` + `useFlashLoanConfig` + `swapInstructionBuilders.ts`, consumed by all swap-config hooks. Do this *before* splitting the god-hooks; it's the keystone.
3. **Decompose the god-hooks** (`useCollateralSwapConfig`, `useClosePositionConfig`, `useDebtSwapConfig`) onto that core — each drops from ~2k to a few hundred LOC.
4. **Unify protocol views** into a config-driven base (fold Venus/Compound into the Aave-fork base via config).
5. **Markets-table kit** — shared `TokenIcon`/`SearchableSelect`/`CollateralStack`/table scaffold; refactor the 3 MarketsSections onto it.
6. **Barrel cleanup + remaining consistency/perf** — mechanical, low-risk, do last.

## Regression-safety protocol for the risky steps (steps 2–3)
The swap/instruction-building path constructs on-chain calldata — a silent change here can drain or revert funds. Refactor it with:
- **Byte-identical calldata diffing**: before refactor, capture the encoded `LendingInstruction[]` / order calldata for a few representative scenarios (collateral swap, debt swap, close, market + limit, each protocol). After refactor, assert the bytes are identical.
- **One operation at a time**, behind the existing typecheck + a manual modal walkthrough per protocol.
- **No "while I'm here" edits** — keep each refactor PR mechanically equivalent.


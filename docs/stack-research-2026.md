# Stack Research - February 2026

_Research for Kapan Finance frontend modernization_

## Current Stack

- Next.js 16.1.1, React 19.2.1
- Zustand ~5.0.0
- TanStack Query ^5.72.2
- Tailwind CSS ~3.4.11 + DaisyUI 4.12.10
- Framer Motion ^12.4.10
- Radix UI Themes ^3.2.1
- Zod ^3.24.2
- Drizzle ORM ^0.45.1
- Vitest ^3.1.1, Playwright ^1.57.0, Storybook ^8.5.0

---

## 1. Zustand v5 - Slice Pattern for DeFi Dashboard

Zustand v5 remains the dominant lightweight state manager. React 19's compiler eliminates
re-render pain from Context, but Zustand is still needed for high-frequency state
(price tickers, position data) and fine-grained subscriptions.

### Recommended Store Structure

```
stores/
  useAppStore.ts              # Combined bound store (single import)
  slices/
    createProtocolSlice.ts    # Active protocol, chain selection, filters
    createPositionsSlice.ts   # User positions across protocols
    createMarketsSlice.ts     # Market/rate data, sorted/filtered views
    createOrdersSlice.ts      # Pending CoW orders, limit order config
    createUISlice.ts          # Modal state, drawer state, sidebar, network filter
```

### Key Rules

- TanStack Query owns **server state** (fetched positions, rates)
- Zustand owns **client state** (UI prefs, selected protocol, filters, pending local ops)
- Don't duplicate between them
- Export selector hooks, not raw store access
- Apply middleware (devtools, immer, persist) only at combined store level

---

## 2. Panda CSS vs Tailwind - Decision: Stay with Tailwind

| Aspect | Panda CSS | Tailwind CSS |
|---|---|---|
| Type safety | Full TS inference | None (class strings) |
| Design tokens | First-class, hierarchical | Via tailwind.config theme |
| Runtime cost | Zero | Zero |
| Build perf | Slower | Faster (Rust engine in v4) |
| Ecosystem | Smaller | Massive (shadcn, etc.) |
| RSC compat | Full | Full |
| Variants | Built-in cva/recipes | Needs CVA library |

**Verdict**: Migration cost (rewrite styling in 90+ files) not justified. Stay with Tailwind,
replace DaisyUI with shadcn/ui.

---

## 3. Component Library - shadcn/ui

### 2026 Landscape

- **shadcn/ui** (66k+ stars) - Best if staying with Tailwind. Copy-paste model. Built on Radix/Base UI.
- **Park UI** (2.2k+ stars) - Best if adopting Panda CSS. Built on Ark UI.
- **Base UI** (v1.0 Dec 2025) - New unstyled primitives from combined Radix/MUI/Floating UI team. shadcn/ui now supports it.

### Recommendation

Replace DaisyUI with **shadcn/ui** (Radix or Base UI primitives + Tailwind styling).
- Proper accessibility (keyboard nav, ARIA)
- Clean, minimal default theme close to "paper" aesthetic
- Full customization since you own the code
- Base UI option for future-proofing

---

## 4. Paper Design Tokens

```typescript
// tailwind.config.ts
colors: {
  paper: {
    50:  '#FDFCFB',  // lightest surface
    100: '#F8F6F3',  // canvas bg (NOT pure white)
    200: '#F0EEEB',  // card surface
    300: '#E5E2DE',  // subtle border
    400: '#C4C0BA',  // disabled text
    500: '#8A8580',  // secondary text
    600: '#5C5752',  // body text
    700: '#3D3935',  // heading text
    800: '#2A2725',  // primary text
    900: '#1A1816',  // ink black
  },
  accent: {
    DEFAULT: '#2563EB',  // blue ink
    muted:   '#93B4F5',  // faded ink
  }
},
boxShadow: {
  xs: '0 1px 2px rgba(0,0,0,0.04)',
  sm: '0 1px 3px rgba(0,0,0,0.06)',
},
fontFamily: {
  sans: ['Inter', 'Helvetica Neue', 'sans-serif'],
  mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
}
```

### Paper Aesthetic Principles

- Warm neutrals over cool grays (off-white #F8F6F3, not pure white)
- 1px borders over box-shadows. Shadows < 6px blur, < 8% opacity
- Typography hierarchy via font-weight/size, not color or borders
- Generous whitespace
- One accent color + gray scale. Muted green/red for rates

---

## 5. Quick Wins (Ordered by Impact/Effort)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| 1 | Replace DaisyUI with shadcn/ui (incremental) | Medium | High |
| 2 | TanStack Query prefetch in Server Components | Low | High |
| 3 | Replace moment -> dayjs | Low | 68kb bundle reduction |
| 4 | Zustand slice pattern | Medium | Maintainability |
| 5 | Paper design tokens in tailwind.config | Low | Visual consistency |
| 6 | framer-motion -> motion | Low | 13kb bundle reduction |
| 7 | React Hook Form + Zod for forms | Low | Type-safe validation |
| 8 | Evaluate dropping ethers (have viem) | Medium | Big bundle reduction |
| 9 | middleware.ts -> proxy.ts (Next.js 16) | Trivial | Future-proof |

---

## 6. Key Next.js 16 Features to Leverage

- **proxy.ts** replaces middleware.ts (Node.js runtime, not Edge)
- **React Compiler stable** - eliminates useMemo/useCallback/React.memo boilerplate
- **View Transitions API** - animate between page navigations
- **Activity component** - render offscreen UI preserving state
- **Layout deduplication** - prefetch shared layouts once

---

## Sources

- [Zustand Slices Pattern](https://zustand.docs.pmnd.rs/guides/slices-pattern)
- [Panda CSS](https://panda-css.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Park UI](https://park-ui.com)
- [Base UI v1.0](https://base-ui.com/)
- [Next.js 16 Blog](https://nextjs.org/blog/next-16)
- [TanStack Query SSR](https://tanstack.com/query/v5/docs/react/guides/advanced-ssr)
- [Motion (formerly Framer Motion)](https://motion.dev)

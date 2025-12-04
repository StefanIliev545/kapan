# Kapan Finance - Project Context & Guidelines

> A comprehensive reference for AI agents and developers working on the Kapan Finance codebase.

---

## 🎯 Product Overview

**Kapan Finance** is a **DeFi Lending Aggregator** that enables users to:
- View and manage lending/borrowing positions across multiple protocols
- Optimize interest rates by moving debt between protocols with one click
- Compare real-time rates and calculate potential savings
- Execute complex DeFi operations through batched transactions

### Core Value Proposition
*"Move your debt to where it costs less, automatically."*

---

## 🌐 Supported Networks & Protocols

### EVM Networks
| Network | Chain ID | Protocols |
|---------|----------|-----------|
| **Base** | 8453 | Aave V3, Compound V3, Venus, ZeroLend |
| **Arbitrum** | 42161 | Aave V3, Compound V3, Venus |
| **Optimism** | 10 | Aave V3, Compound V3 |
| **Linea** | 59144 | Aave V3, Compound V3, ZeroLend |

### Starknet
| Network | Protocols |
|---------|-----------|
| **Starknet Mainnet** | Vesu (V1 & V2), Nostra |

---

## 🏗️ Technical Architecture

### Tech Stack
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + DaisyUI
- **Animations**: Framer Motion
- **EVM**: Wagmi, Viem, RainbowKit
- **Starknet**: starknet-react, starknet.js
- **State**: React Query (TanStack Query)
- **Smart Contracts**: Solidity (Hardhat), Cairo (Starknet)

### Key Architectural Patterns

#### 1. Protocol Instructions System
The app uses a unified instruction system for building complex DeFi transactions:

```typescript
// Core instruction types
enum RouterInstructionType {
  FlashLoan = 0,
  PullToken = 1,
  PushToken = 2,
  ToOutput = 3,
  Approve = 4,
  Split = 5,
  Add = 6,
  Subtract = 7,
}

enum LendingOp {
  Deposit = 0,
  DepositCollateral = 1,
  WithdrawCollateral = 2,
  Borrow = 3,
  Repay = 4,
  GetBorrowBalance = 5,
  GetSupplyBalance = 6,
  Swap = 7,
  SwapExactOut = 8,
}
```

#### 2. EIP-5792 Atomic Batching
The app supports atomic transaction batching for wallets that support it:
- Bundles approvals + main transaction into single atomic call
- Graceful fallback to sequential execution
- User preference toggle for batching behavior

#### 3. Flash Loan Providers
Multiple flash loan sources for liquidity:
- Balancer V2 & V3
- Aave V3
- Uniswap V3

---

## 📁 Project Structure

```
packages/nextjs/
├── app/                    # Next.js App Router pages
│   ├── app/               # Main positions dashboard (/app)
│   ├── markets/           # Markets comparison page (/markets)
│   ├── info/              # Documentation/info pages
│   └── automate/          # Automation features
├── components/
│   ├── modals/            # Transaction modals (EVM)
│   │   └── stark/         # Starknet-specific modals
│   ├── specific/          # Protocol-specific components
│   │   ├── aave/
│   │   ├── compound/
│   │   ├── venus/
│   │   ├── vesu/
│   │   ├── nostra/
│   │   └── zerolend/
│   ├── markets/           # Market display components
│   ├── home/              # Landing page components
│   └── scaffold-eth/      # EVM wallet components
│   └── scaffold-stark/    # Starknet wallet components
├── hooks/
│   ├── useKapanRouterV2   # Core EVM transaction builder
│   ├── useEvmTransactionFlow # EVM transaction orchestration
│   ├── useVesu*           # Vesu protocol hooks
│   ├── useNostra*         # Nostra protocol hooks
│   └── scaffold-eth/      # Scaffold-ETH utility hooks
├── utils/
│   └── v2/                # Router instruction helpers
└── contexts/              # React contexts
```

---

## 🎨 Design System

### Theme System
- **DaisyUI themes**: light, synthwave (dark), emerald, retro, forest, valentine
- **Default dark**: synthwave (custom muted indigo/purple palette)
- **Theme switching**: Via `SwitchTheme` component in `FloatingSocials`

### Color Palette (Synthwave Dark Theme)
```css
base-100: #1E1E2E   /* Main background */
base-200: #2A2A3C   /* Surface/cards */
base-300: #3A3A4F   /* Borders/accents */
base-content: #E6E6EF /* Text */
primary: #7AA2F7    /* Blue primary */
secondary: #AD8EE6  /* Purple secondary */
accent: #F4B8E4     /* Pink accent */
success: #A6E3A1    /* Green */
warning: #F9E2AF    /* Yellow */
error: #F28FAD      /* Red/pink */
```

### Typography Patterns
- **Labels**: `text-[10px] uppercase tracking-widest text-base-content/40 font-semibold`
- **Values**: `text-sm font-mono font-bold tabular-nums`
- **Headings**: Standard Tailwind sizing with Inter font family

### Common UI Patterns

#### Card Containers
```jsx
<div className="card bg-gradient-to-br from-base-100 to-base-100/95 
  shadow-lg hover:shadow-xl transition-shadow duration-300 
  rounded-xl border border-base-200/50">
```

#### Stat Display
```jsx
<div className="flex flex-col gap-1 items-center px-3 py-1.5 
  rounded-lg hover:bg-base-200/30 transition-colors duration-200">
  <span className="text-[10px] uppercase tracking-widest text-base-content/40 font-semibold">
    Label
  </span>
  <span className="text-sm font-mono font-bold tabular-nums text-success">
    $1,234.56
  </span>
</div>
```

#### Buttons (Action)
```jsx
// Primary action - dashed border style
<button className="group w-full flex items-center justify-center gap-2 
  py-2 px-4 rounded-lg border border-dashed border-base-300 
  hover:border-primary/50 bg-base-200/30 hover:bg-primary/5 
  text-base-content/50 hover:text-primary transition-all duration-200">
  <FiPlus className="w-3.5 h-3.5 transition-transform group-hover:rotate-90" />
  <span className="text-xs font-medium uppercase tracking-wider">Add Supply</span>
</button>
```

#### Token Icons
```jsx
<div className="w-10 h-10 relative rounded-xl bg-gradient-to-br 
  from-base-200 to-base-300/50 p-1.5 flex items-center justify-center 
  ring-1 ring-base-300/50 shadow-sm">
  <Image src={icon} alt={name} width={28} height={28} className="object-contain" />
</div>
```

---

## 🔧 Key Components

### Position Components
- **`ProtocolView`**: Main protocol dashboard showing supply/borrow positions
- **`SupplyPosition`**: Individual supply position row with expand/collapse
- **`BorrowPosition`**: Individual borrow position row with actions

### Modal Components
EVM modals follow a pattern using `useEvmTransactionFlow`:
- `DepositModal` / `WithdrawModal`
- `BorrowModal` / `RepayModal`
- `MovePositionModal` / `MoveSupplyModal`
- `CollateralSwapModal` / `DebtSwapEvmModal`
- `CloseWithCollateralEvmModal`

Starknet modals use protocol-specific hooks:
- `DepositModalStark` / `WithdrawModalStark`
- `BorrowModalStark` / `RepayModalStark`
- `SwitchDebtModalStark` / `SwitchCollateralModalStark`

### Market Components
- **`MarketsGrouped`**: Groups markets by token, shows best rates
- **`RatePill`**: Displays supply/borrow rate with styling
- **`NetworkFilter`**: Network selection with URL sync

---

## 🔄 Transaction Flows

### Basic Lending Flow (EVM)
```
1. User enters amount
2. Build instruction array (pull token → approve → deposit/borrow)
3. Check if batching available (EIP-5792)
4. If batching: bundle approval + main tx atomically
5. If no batching: execute approval first, then main tx
6. Show toast notifications for each step
```

### Move Position Flow (EVM)
```
1. Flash loan debt amount from source
2. Repay debt on source protocol
3. Withdraw collateral from source
4. Deposit collateral to destination
5. Borrow on destination to repay flash loan
6. Handle any swap if tokens differ
```

### Starknet Flow
Uses `usePaymasterTransactor` or `useSmartTransactor` for:
- Gasless transactions via AVNU paymaster
- Multi-call batching native to Starknet

---

## 💡 Best Practices for Frontend Development

### DO:
- ✅ Use monospace fonts (`font-mono`) for numerical values
- ✅ Use `tabular-nums` for aligned numbers in tables
- ✅ Color-code values: green for positive/supply, red for negative/borrow
- ✅ Use tiny uppercase labels (`text-[10px] uppercase tracking-widest`)
- ✅ Add hover states with `transition-all duration-200`
- ✅ Use gradient backgrounds for depth (`bg-gradient-to-br`)
- ✅ Include loading states and skeletons
- ✅ Handle empty states gracefully
- ✅ Use Framer Motion for meaningful animations

### DON'T:
- ❌ Use generic fonts (Inter, Arial) - project has custom typography
- ❌ Use flat solid backgrounds without gradients/depth
- ❌ Forget hover/active states on interactive elements
- ❌ Mix styling patterns (stay consistent with existing components)
- ❌ Add excessive animations that distract from content
- ❌ Use placeholder text/images in production

### Styling Conventions
```jsx
// Good: Consistent with project style
<div className="rounded-xl bg-gradient-to-br from-base-100 to-base-200/50 
  border border-base-300/30 shadow-md hover:shadow-lg transition-all">

// Bad: Generic/flat styling
<div className="rounded bg-white border p-4">
```

---

## 📊 Data Display Patterns

### Currency Formatting
- Always use `$` prefix for USD values
- Use `formatCurrency()` utility for consistent formatting
- Negative values show in red, positive in green

### Percentage Formatting
- APY/APR values show with `%` suffix
- Use `formatPercentage()` or `formatSignedPercentage()`
- Color: green for earning, red for paying

### Token Amounts
- Show token symbol after amount
- Use appropriate decimal precision
- Large numbers: abbreviate (1.5M, 2.3K)

---

## 🚀 Feature Flags & Configuration

### Environment Variables
```
NEXT_PUBLIC_ALCHEMY_API_KEY      # Alchemy RPC
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID  # WalletConnect
NEXT_PUBLIC_ENABLE_HARDHAT_UI   # Show Hardhat network in dev
```

### Runtime Configuration
- `scaffold.config.ts`: Network configs, polling intervals
- `supportedChains.ts`: Starknet chain definitions
- `wagmiConfig.tsx`: EVM wallet configuration

---

## 🧪 Testing Approach

- Use browser tools for visual testing
- Test on multiple networks (Base, Arbitrum, Starknet)
- Verify wallet connection flows
- Check responsive behavior (mobile/desktop)
- Test both light and dark themes

---

## 📝 Common Terminology

| Term | Meaning |
|------|---------|
| **Position** | A user's supply or borrow in a protocol |
| **LTV** | Loan-to-Value ratio |
| **Utilization** | How much of borrowing capacity is used |
| **Flash Loan** | Uncollateralized loan repaid in same tx |
| **Move Position** | Transfer debt/supply to different protocol |
| **Collateral Swap** | Change collateral asset without closing |
| **Debt Swap** | Change borrowed asset without closing |
| **Refinance** | Move to better rates (legacy term) |

---

## 🔗 Related Resources

- **Live App**: https://kapan.finance/app
- **Landing**: https://kapan.finance
- **Documentation**: https://kapan.finance/info
- **Audit Report**: `/audits/022_CODESPECT_KAPAN_FINANCE.pdf`

---

*Last updated: December 2024*


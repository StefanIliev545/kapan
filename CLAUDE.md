# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kapan Finance is a DeFi protocol for optimizing borrowing costs by moving debt positions between lending platforms (Aave, Compound, Venus, Morpho Blue) across multiple chains (Arbitrum, Base, Ethereum, Optimism, Linea). The project also supports Starknet with Nostra and Vesu protocols.

## Monorepo Structure

```
packages/
├── hardhat/     # EVM smart contracts (Solidity), deploy scripts, tests
├── nextjs/      # Frontend (Next.js 16, React 19, TailwindCSS)
└── snfoundry/   # Starknet contracts (Cairo), deployment scripts
```

## Common Commands

### Root-level (run from repo root)
```bash
yarn install          # Install all dependencies (MUST use yarn, not npm)
yarn start           # Start Next.js dev server
yarn build           # Build Next.js for production
yarn chain           # Run local Hardhat node (no forking)
yarn fork            # Run Hardhat node forked from mainnet (default: Arbitrum)
yarn deploy          # Deploy contracts to local network
yarn test            # Run Hardhat tests (non-fork tests only)
yarn lint            # Lint both Next.js and Hardhat packages
```

### Hardhat package
```bash
yarn hardhat:compile                    # Compile Solidity contracts
yarn hardhat:test                       # Run non-fork tests
yarn hardhat:test:fork                  # Run fork tests
FORK_CHAIN=base yarn fork               # Fork a specific chain (arbitrum, base, ethereum, optimism, linea)
npx hardhat test test/v2/MyTest.ts      # Run a single test file
npx hardhat test --grep "pattern"       # Run tests matching pattern
```

### Starknet (snfoundry) package
```bash
yarn snchain         # Start starknet-devnet (forked from mainnet)
yarn sndeploy        # Deploy Cairo contracts
yarn sntest          # Run Cairo tests with snforge
yarn sncompile       # Compile Cairo contracts
```

### Next.js package
```bash
yarn dev             # Start dev server with Turbo
yarn next:build      # Production build
yarn next:check-types # TypeScript type checking
```

## Architecture

### Smart Contracts (packages/hardhat/contracts/v2/)

**KapanRouter** - Main entry point for all operations. Executes instructions via protocol gateways using flash loans from Balancer V2/V3 or Aave.

**Gateway Pattern** - Each lending protocol has Read (View) and Write gateways:
- `AaveGatewayView` / `AaveGatewayWrite`
- `CompoundGatewayView` / `CompoundGatewayWrite`
- `VenusGatewayView` / `VenusGatewayWrite`
- `MorphoBlueGatewayView` / `MorphoBlueGatewayWrite`

**CoW Protocol Integration** - For order-based execution:
- `KapanCowAdapter` - ERC-1271 signature adapter
- `KapanOrderManager` - Order creation/management
- `KapanOrderHandler` - Order execution

### Frontend (packages/nextjs/)

**Key directories:**
- `app/` - Next.js App Router pages
- `components/` - React components (modals, scaffold-eth, scaffold-stark)
- `hooks/` - Custom hooks for protocol interactions (useAaveEMode, useMorphoLendingPositions, useVesuAssets, etc.)
- `utils/` - Utility functions and constants

**Dual-chain support:** The frontend supports both EVM chains (via RainbowKit/wagmi/viem) and Starknet (via starknet-react).

### Starknet (packages/snfoundry/contracts/src/)

**Gateways:**
- `NostraGateway.cairo` - Nostra protocol
- `vesu_gateway.cairo` / `VesuGatewayV2.cairo` - Vesu protocol
- `ekubo_gateway.cairo` - Ekubo DEX
- `avnu_gateway.cairo` - AVNU aggregator

## Development Patterns

### Fork Testing
Tests with `.fork.ts` suffix require mainnet forking:
```bash
FORK_CHAIN=arbitrum yarn fork  # In terminal 1
yarn hardhat:test:fork         # In terminal 2
```

### Deploy Scripts
Located in `packages/hardhat/deploy/v2/`. Numbered for execution order. Auto-generates TypeScript ABIs after deployment.

### Dependency Management
- This workspace uses Yarn Berry with `node-modules` linker
- Never use npm or commit package-lock.json (causes Next.js build issues)
- Always install with `yarn`

## Key Technical Concepts

### UTXO-Based Instruction System
The KapanRouter uses a UTXO (Unspent Transaction Output) model for composing operations:

```solidity
// Instructions reference outputs from previous instructions via InputPtr
struct LendingInstruction {
    LendingOp op;           // Deposit, Withdraw, Borrow, Repay, etc.
    address token;          // underlying token
    address user;           // user account
    uint256 amount;         // amount (or 0 to use input)
    bytes context;          // protocol-specific (e.g., Compound market)
    InputPtr input;         // pointer to prior output index
}
```

Operations: `Deposit`, `DepositCollateral`, `WithdrawCollateral`, `Borrow`, `Repay`, `GetBorrowBalance`, `GetSupplyBalance`, `Swap`, `SwapExactOut`, `SetEMode`

### Flash Loan Providers
Supported providers in `FlashLoanConsumerBase`:
- Balancer V2/V3
- Aave V3
- ZeroLend
- Uniswap V3
- Morpho

### Authorization Flow
Gateways implement `authorize()` and `deauthorize()` to generate user approval transactions:
- `authorize()` returns approval targets/data needed before execution
- `deauthorize()` returns transactions to revoke approvals after execution

## Environment Variables

### Hardhat (`packages/hardhat/.env`)
```
ALCHEMY_API_KEY=              # RPC provider
MAINNET_FORKING_ENABLED=true  # Enable fork testing
FORK_CHAIN=arbitrum           # Chain to fork (arbitrum, base, ethereum, optimism, linea)
```

### Next.js (`packages/nextjs/.env.local`)
```
NEXT_PUBLIC_ALCHEMY_API_KEY=
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=
NEXT_PUBLIC_ONE_INCH_API_KEY=
NEXT_PUBLIC_ENABLE_HARDHAT_UI=true  # Show localhost in chain selector
```

## Testing Conventions

- **Unit tests** (`*.test.ts`): Run without fork, test isolated logic
- **Fork tests** (`*.fork.ts`): Require `MAINNET_FORKING_ENABLED=true`, test against real protocol state
- Tests check `network.config.chainId` to skip if wrong chain is forked
- Use whale addresses for token funding in fork tests
- Test timeout typically 120s for fork tests

## Key Addresses (Arbitrum)

```
USDC:            0xaf88d065e77c8cC2239327C5EDb3A432268e5831
WETH:            0x82aF49447D8a07e3bd95BD0d56f35241523fBab1
Balancer V3:     0xbA1333333333a1BA1108E8412f11850A5C319bA9
Aave Provider:   0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb
Compound USDC:   0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf
```

## Configuration Files

- `packages/hardhat/hardhat.config.ts` - Networks, compiler settings, fork configuration
- `packages/nextjs/scaffold.config.ts` - Supported chains, polling, API keys
- `packages/snfoundry/contracts/Scarb.toml` - Cairo project config

## Issue Tracking

This project uses **bd (beads)** for issue tracking.

```bash
bd ready                              # Find unblocked work
bd create "Title" --type task         # Create issue
bd close <id>                         # Complete work
bd show <id>                          # View issue details
bd sync                               # Sync with git (run at session end)
bd prime                              # Full workflow context
```

## Code Quality Tools

**Run before submitting any code changes:**

```bash
yarn quality                          # Full quality check suite
yarn quality:fix                      # Auto-fix what's possible
yarn quality:report                   # Generate reports in .quality/
```

**Individual checks:**

```bash
yarn quality:duplicates               # Find copy-paste code (jscpd)
yarn quality:circular                 # Find circular imports (madge)
yarn quality:unused                   # Find dead code (knip)
yarn quality:complexity               # Find complex functions (sonarjs)
yarn next:check-types                 # TypeScript strict checking
yarn lint                             # ESLint with sonarjs rules
```

**Exit codes for CI/agents:**
- `0` - All checks passed
- `1` - Warnings found (non-blocking)
- `2` - Critical issues (blocking)

## Agent Workflow

### Single Agent Flow
```bash
yarn agent:preflight                  # Check starting state
# ... make changes ...
yarn agent:postflight                 # Validate changes (warnings OK)
yarn agent:postflight:strict          # Validate changes (no warnings)
```

### Parallel Agent Work
Multiple agents can work simultaneously on different files. Example patterns:

**Parallel fixes**: Fix modals while another agent fixes hooks
**Parallel analysis**: Analyze duplicates while checking circular deps
**Parallel refactoring**: Refactor EVM modals while another does Starknet

Agents should:
1. **Before coding**: Run `yarn agent:preflight`
2. **Claim work**: Use `bd show <id>` to understand the task
3. **After changes**: Run `yarn agent:postflight`
4. **Before PR**: Ensure postflight exit code is 0
5. **On completion**: Run `bd close <id>` and `bd sync`

### Quality Gates (Exit Codes)
| Script | 0 | 1 | 2 |
|--------|---|---|---|
| `yarn quality` | All pass | Warnings | Errors |
| `yarn agent:postflight` | Ready | Warnings (OK) | Errors (block) |
| `yarn agent:postflight:strict` | Ready | Warnings (block) | Errors (block) |

Quality reports are saved to `.quality/` directory when using `--report` flag.

## Visual Verification (Storybook)

Storybook is configured for visual component testing. Agents can capture and view rendered components.

### Building and Serving

```bash
cd packages/nextjs
yarn storybook:build              # Build static Storybook
yarn storybook:serve              # Serve on http://localhost:6006
yarn storybook                    # Dev mode with hot reload
```

### Capturing Screenshots

Use the capture script to take screenshots of specific stories:

```bash
node scripts/capture-story.mjs <story-id> [output-path]

# Examples:
node scripts/capture-story.mjs common-loading--spinner
node scripts/capture-story.mjs common-loading--spinner /tmp/my-screenshot.png
```

The script:
- Automatically starts the server if not running (reuses existing on port 6006)
- Builds Storybook if `storybook-static/` doesn't exist
- Saves to `/tmp/storybook-screenshots/` by default
- Multiple agents can share the same server instance

### Viewing Screenshots

After capturing, view with the Read tool:
```
Read tool: /tmp/storybook-screenshots/common-loading--spinner.png
```

### Available Stories

List all available story IDs:
```bash
node scripts/capture-story.mjs
# Shows: common-loading--spinner, common-loading--large, etc.
```

### Adding New Stories

Create `*.stories.tsx` files in `packages/nextjs/components/`:

```typescript
import type { Meta, StoryObj } from "@storybook/react";
import { MyComponent } from "./MyComponent";

const meta: Meta<typeof MyComponent> = {
  title: "Category/MyComponent",
  component: MyComponent,
};
export default meta;

type Story = StoryObj<typeof MyComponent>;

export const Default: Story = {
  args: { prop: "value" },
};
```

After adding stories, rebuild: `yarn storybook:build`

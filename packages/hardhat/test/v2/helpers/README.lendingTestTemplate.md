# Lending Test Template

This template provides a reusable testing framework for lending protocol fork tests (Aave, Compound, Venus).

## Features

- **Gateway agnostic**: Works with any gateway that implements `IGateway`
- **Token pair support**: Supports same token (e.g., USDC/USDC) or different tokens (e.g., WETH/USDC)
- **Configurable amounts**: Deposit, borrow, repay, and withdraw amounts
- **Automatic setup**: Handles user funding, gateway deployment, and approvals

## Usage

### Example 1: Same Token (USDC collateral, USDC debt)

```typescript
import { setupLendingTest, setupApprovals, createLendingFlowInstructions, verifyLendingFlowBalances } from "./helpers/lendingTestTemplate";

const USDC: TokenConfig = {
  address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  decimals: 6,
  whale: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
};

const config: LendingTestConfig = {
  collateralToken: USDC,
  debtToken: USDC,
  amounts: {
    deposit: 1_000_000_000n, // 1,000 USDC
    borrow: 100_000_000n,   // 100 USDC
    // repay defaults to borrow, withdraw defaults to deposit
  },
  gateway: {
    type: "aave",
    protocolName: "aave",
    factoryName: "AaveGatewayWrite",
    deployArgs: [process.env.AAVE_POOL_ADDRESSES_PROVIDER || "", 0],
  },
  userFunding: {
    collateral: 2_000_000_000n, // 2,000 USDC (enough for deposit + repay)
  },
};

it("should execute deposit -> borrow -> repay -> withdraw", async function () {
  const setup = await setupLendingTest(config);
  await setupApprovals(setup, config, config.amounts);
  
  const userBalanceBefore = await setup.collateralToken.balanceOf(await setup.user.getAddress());
  const instructions = await createLendingFlowInstructions(setup, config, config.amounts);
  
  const tx = await setup.router.connect(setup.user).processProtocolInstructions(instructions);
  const receipt = await tx.wait();
  
  await verifyLendingFlowBalances(setup, config, config.amounts, userBalanceBefore);
});
```

### Example 2: Different Tokens (WETH collateral, USDC debt)

```typescript
const WETH: TokenConfig = {
  address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  decimals: 18,
  whale: process.env.WETH_WHALE,
};

const config: LendingTestConfig = {
  collateralToken: WETH,
  debtToken: USDC,
  amounts: {
    deposit: ethers.parseEther("1"),    // 1 WETH
    borrow: 100_000_000n,                // 100 USDC
    repay: 100_000_000n,                 // 100 USDC
    withdraw: ethers.parseEther("1"),    // 1 WETH
  },
  gateway: {
    type: "compound",
    protocolName: "compound",
    factoryName: "CompoundGatewayWrite",
    deployArgs: [],
  },
  userFunding: {
    collateral: ethers.parseEther("2"),  // 2 WETH
    debt: 200_000_000n,                  // 200 USDC (for repay)
  },
};
```

## Gateway Configuration

### Aave

```typescript
const AAVE_GATEWAY: GatewayConfig = {
  type: "aave",
  protocolName: "aave",
  factoryName: "AaveGatewayWrite",
  deployArgs: [process.env.AAVE_POOL_ADDRESSES_PROVIDER || "", 0], // [poolAddressesProvider, referralCode]
};
```

### Compound

```typescript
const COMPOUND_GATEWAY: GatewayConfig = {
  type: "compound",
  protocolName: "compound",
  factoryName: "CompoundGatewayWrite",
  deployArgs: [], // Add constructor args as needed
};
```

### Venus

```typescript
const VENUS_GATEWAY: GatewayConfig = {
  type: "venus",
  protocolName: "venus",
  factoryName: "VenusGatewayWrite",
  deployArgs: [process.env.VENUS_COMPTROLLER || "", process.env.VENUS_OWNER || ""], // [comptroller, owner]
};
```

## Token Configuration

Each token needs:
- `address`: Token contract address
- `decimals`: Token decimals (for display purposes)
- `whale` (optional): Address to impersonate for funding the test user

## Amounts Configuration

- `deposit`: Amount to deposit as collateral (required)
- `borrow`: Amount to borrow (required)
- `repay` (optional): Amount to repay (defaults to `borrow`)
- `withdraw` (optional): Amount to withdraw (defaults to `deposit`)

## Helper Functions

### `setupLendingTest(config)`

Deploys router and gateway, funds user, returns test setup.

### `setupApprovals(setup, config, amounts)`

Sets up all required approvals for gateway and router operations.

### `createLendingFlowInstructions(setup, config, amounts)`

Creates the complete instruction array for deposit -> borrow -> repay -> withdraw flow.

### `verifyLendingFlowBalances(setup, config, amounts, userBalanceBefore)`

Verifies final balances match expected values.

## Environment Variables

Required environment variables depend on the gateway:

- `MAINNET_FORKING_ENABLED=true` (required for all fork tests)
- `AAVE_POOL_ADDRESSES_PROVIDER` (for Aave)
- `VENUS_COMPTROLLER`, `VENUS_OWNER` (for Venus)
- `USDC_WHALE`, `WETH_WHALE` (for funding test users)


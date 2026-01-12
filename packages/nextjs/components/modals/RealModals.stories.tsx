import type { Meta, StoryObj } from "@storybook/react";
import { DepositModal } from "./DepositModal";
import { WithdrawModal } from "./WithdrawModal";
import { BorrowModal } from "./BorrowModal";
import { RepayModal } from "./RepayModal";
import { TokenActionModal } from "./TokenActionModal";
import { RefinanceModal } from "./RefinanceModal";
import { CollateralSwapModal } from "./CollateralSwapModal";
import { DebtSwapEvmModal } from "./DebtSwapEvmModal";
import type { Address } from "viem";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

// =============================================================================
// MOCK DATA
// =============================================================================

const tokens = {
  usdc: {
    name: "USDC",
    icon: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
    address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as `0x${string}`,
    currentRate: 3.5,
    usdPrice: 1.0,
    decimals: 6,
  },
  weth: {
    name: "WETH",
    icon: "https://assets.coingecko.com/coins/images/2518/small/weth.png",
    address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" as `0x${string}`,
    currentRate: 2.1,
    usdPrice: 3500,
    decimals: 18,
  },
};

// =============================================================================
// TOKEN ACTION MODAL (Base component)
// =============================================================================

const meta: Meta<typeof TokenActionModal> = {
  title: "Modals/Real",
  component: TokenActionModal,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

// =============================================================================
// DEPOSIT MODAL
// =============================================================================

export const DepositUSDC: StoryObj<typeof DepositModal> = {
  name: "Deposit USDC",
  render: () => (
    <DepositModal
      isOpen={true}
      onClose={noop}
      token={tokens.usdc}
      protocolName="Aave"
      chainId={42161}
    />
  ),
};

export const DepositWETH: StoryObj<typeof DepositModal> = {
  name: "Deposit WETH",
  render: () => (
    <DepositModal
      isOpen={true}
      onClose={noop}
      token={tokens.weth}
      protocolName="Compound"
      chainId={42161}
    />
  ),
};

// =============================================================================
// WITHDRAW MODAL
// =============================================================================

export const WithdrawUSDC: StoryObj<typeof WithdrawModal> = {
  name: "Withdraw USDC",
  render: () => (
    <WithdrawModal
      isOpen={true}
      onClose={noop}
      token={tokens.usdc}
      protocolName="Aave"
      supplyBalance={BigInt("5000000000")}
      chainId={42161}
    />
  ),
};

// =============================================================================
// BORROW MODAL
// =============================================================================

export const BorrowUSDC: StoryObj<typeof BorrowModal> = {
  name: "Borrow USDC",
  render: () => (
    <BorrowModal
      isOpen={true}
      onClose={noop}
      token={tokens.usdc}
      protocolName="Aave"
      currentDebt={500}
      chainId={42161}
    />
  ),
};

export const BorrowWETH: StoryObj<typeof BorrowModal> = {
  name: "Borrow WETH",
  render: () => (
    <BorrowModal
      isOpen={true}
      onClose={noop}
      token={tokens.weth}
      protocolName="Morpho"
      currentDebt={0.5}
      chainId={42161}
    />
  ),
};

// =============================================================================
// REPAY MODAL
// =============================================================================

export const RepayUSDC: StoryObj<typeof RepayModal> = {
  name: "Repay USDC",
  render: () => (
    <RepayModal
      isOpen={true}
      onClose={noop}
      token={tokens.usdc}
      protocolName="Aave"
      debtBalance={BigInt("2500000000")}
      chainId={42161}
    />
  ),
};

// =============================================================================
// TOKEN ACTION MODAL (Direct usage)
// =============================================================================

export const TokenActionDeposit: StoryObj<typeof TokenActionModal> = {
  name: "TokenActionModal - Deposit",
  render: () => (
    <TokenActionModal
      isOpen={true}
      onClose={noop}
      action="Deposit"
      token={tokens.usdc}
      protocolName="Aave"
      apyLabel="Supply APY"
      apy={3.5}
      metricLabel="Total supplied"
      before={1000}
      balance={BigInt("5000000000")}
      network="evm"
      chainId={42161}
      hf={2.5}
      ltv={45}
      utilization={65}
    />
  ),
};

export const TokenActionBorrow: StoryObj<typeof TokenActionModal> = {
  name: "TokenActionModal - Borrow",
  render: () => (
    <TokenActionModal
      isOpen={true}
      onClose={noop}
      action="Borrow"
      token={tokens.weth}
      protocolName="Morpho"
      apyLabel="Borrow APY"
      apy={2.8}
      metricLabel="Total debt"
      before={0.5}
      balance={BigInt("2000000000000000000")}
      network="evm"
      chainId={42161}
      hf={1.9}
      ltv={55}
      utilization={68}
    />
  ),
};

export const TokenActionRepay: StoryObj<typeof TokenActionModal> = {
  name: "TokenActionModal - Repay",
  render: () => (
    <TokenActionModal
      isOpen={true}
      onClose={noop}
      action="Repay"
      token={tokens.usdc}
      protocolName="Aave"
      apyLabel="Borrow APY"
      apy={5.2}
      metricLabel="Total debt"
      before={5000}
      balance={BigInt("6000000000")}
      network="evm"
      chainId={42161}
      hf={1.15}
      ltv={85}
      utilization={92}
    />
  ),
};

export const TokenActionWithdraw: StoryObj<typeof TokenActionModal> = {
  name: "TokenActionModal - Withdraw",
  render: () => (
    <TokenActionModal
      isOpen={true}
      onClose={noop}
      action="Withdraw"
      token={tokens.weth}
      protocolName="Compound"
      apyLabel="Supply APY"
      apy={2.1}
      metricLabel="Total supplied"
      before={5.0}
      balance={BigInt("5000000000000000000")}
      network="evm"
      chainId={42161}
      hf={2.8}
      ltv={40}
      utilization={60}
    />
  ),
};

// =============================================================================
// REFINANCE MODAL
// =============================================================================

export const RefinanceDebt: StoryObj<typeof RefinanceModal> = {
  name: "Refinance Debt",
  render: () => (
    <RefinanceModal
      isOpen={true}
      onClose={noop}
      fromProtocol="Aave"
      position={{
        name: "USDC",
        tokenAddress: tokens.usdc.address,
        decimals: 6,
        balance: BigInt("5000000000"),
        type: "borrow",
      }}
      chainId={42161}
      networkType="evm"
      preSelectedCollaterals={[
        {
          token: tokens.weth.address,
          symbol: "WETH",
          decimals: 18,
          amount: BigInt("2000000000000000000"),
          maxAmount: BigInt("5000000000000000000"),
        },
      ]}
    />
  ),
};

// =============================================================================
// COLLATERAL SWAP MODAL
// =============================================================================

const mockCollaterals = [
  {
    address: tokens.weth.address,
    symbol: "WETH",
    icon: tokens.weth.icon,
    decimals: 18,
    rawBalance: BigInt("3000000000000000000"),
    balance: 3.0,
    usdValue: 10500,
    price: BigInt("350000000000"),
  },
  {
    address: tokens.usdc.address,
    symbol: "USDC",
    icon: tokens.usdc.icon,
    decimals: 6,
    rawBalance: BigInt("5000000000"),
    balance: 5000,
    usdValue: 5000,
    price: BigInt("100000000"),
  },
];

export const CollateralSwap: StoryObj<typeof CollateralSwapModal> = {
  name: "Collateral Swap",
  render: () => (
    <CollateralSwapModal
      isOpen={true}
      onClose={noop}
      protocolName="Aave"
      availableAssets={mockCollaterals}
      initialFromTokenAddress={tokens.weth.address}
      chainId={42161}
      position={{
        name: "USDC",
        tokenAddress: tokens.usdc.address,
        decimals: 6,
        balance: BigInt("2000000000"),
        type: "borrow",
      }}
    />
  ),
};

// =============================================================================
// DEBT SWAP MODAL
// =============================================================================

const mockSwapAssets = [
  {
    symbol: "USDC",
    address: tokens.usdc.address as Address,
    decimals: 6,
    rawBalance: BigInt("5000000000"),
    balance: 5000,
    icon: tokens.usdc.icon,
    usdValue: 5000,
    price: BigInt("100000000"),
  },
  {
    symbol: "WETH",
    address: tokens.weth.address as Address,
    decimals: 18,
    rawBalance: BigInt("2000000000000000000"),
    balance: 2.0,
    icon: tokens.weth.icon,
    usdValue: 7000,
    price: BigInt("350000000000"),
  },
];

export const DebtSwap: StoryObj<typeof DebtSwapEvmModal> = {
  name: "Debt Swap",
  render: () => (
    <DebtSwapEvmModal
      isOpen={true}
      onClose={noop}
      protocolName="Aave"
      chainId={42161}
      debtFromToken={tokens.usdc.address}
      debtFromName="USDC"
      debtFromIcon={tokens.usdc.icon}
      debtFromDecimals={6}
      debtFromPrice={BigInt("100000000")}
      currentDebtBalance={BigInt("5000000000")}
      availableAssets={mockSwapAssets}
    />
  ),
};

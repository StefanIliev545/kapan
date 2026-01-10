import type { Meta, StoryObj } from "@storybook/react";
import { TokenActionCard } from "./TokenActionModal";
import { BaseModal } from "./BaseModal";

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

// =============================================================================
// MOCK DATA
// =============================================================================

const tokens = {
  usdc: {
    name: "USDC",
    icon: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
    address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    currentRate: 3.5,
    usdPrice: 1.0,
    decimals: 6,
  },
  weth: {
    name: "WETH",
    icon: "https://assets.coingecko.com/coins/images/2518/small/weth.png",
    address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    currentRate: 2.1,
    usdPrice: 3500,
    decimals: 18,
  },
  wbtc: {
    name: "WBTC",
    icon: "https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png",
    address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    currentRate: 0.5,
    usdPrice: 97000,
    decimals: 8,
  },
  dai: {
    name: "DAI",
    icon: "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png",
    address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
    currentRate: 4.2,
    usdPrice: 1.0,
    decimals: 18,
  },
};

// =============================================================================
// TOKEN ACTION CARD STORIES (Deposit, Withdraw, Borrow, Repay)
// =============================================================================

const tokenActionMeta: Meta<typeof TokenActionCard> = {
  title: "Modals/TokenActions",
  component: TokenActionCard,
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "500px", maxWidth: "100%" }}>
        <Story />
      </div>
    ),
  ],
};

export default tokenActionMeta;
type Story = StoryObj<typeof TokenActionCard>;

// --- DEPOSIT STORIES ---

export const DepositUSDC_Aave: Story = {
  name: "Deposit USDC (Aave)",
  render: () => (
    <TokenActionCard
      action="Deposit"
      token={tokens.usdc}
      protocolName="Aave"
      apyLabel="Supply APY"
      apy={3.5}
      metricLabel="Total supplied"
      before={1000}
      balance={BigInt("5000000000")}
      hf={2.5}
      ltv={45}
      network="evm"
      utilization={65}
    />
  ),
};

export const DepositWETH_Compound: Story = {
  name: "Deposit WETH (Compound)",
  render: () => (
    <TokenActionCard
      action="Deposit"
      token={tokens.weth}
      protocolName="Compound"
      apyLabel="Supply APY"
      apy={2.1}
      metricLabel="Total supplied"
      before={2.5}
      balance={BigInt("1500000000000000000")}
      hf={3.2}
      ltv={35}
      network="evm"
      utilization={55}
    />
  ),
};

export const DepositWBTC_Morpho: Story = {
  name: "Deposit WBTC (Morpho)",
  render: () => (
    <TokenActionCard
      action="Deposit"
      token={tokens.wbtc}
      protocolName="Morpho"
      apyLabel="Supply APY"
      apy={0.8}
      metricLabel="Total supplied"
      before={0.1}
      balance={BigInt("5000000")}
      hf={4.0}
      ltv={25}
      network="evm"
      utilization={40}
    />
  ),
};

// --- WITHDRAW STORIES ---

export const WithdrawUSDC_Aave: Story = {
  name: "Withdraw USDC (Aave)",
  render: () => (
    <TokenActionCard
      action="Withdraw"
      token={tokens.usdc}
      protocolName="Aave"
      apyLabel="Supply APY"
      apy={3.5}
      metricLabel="Total supplied"
      before={10000}
      balance={BigInt("10000000000")}
      hf={2.1}
      ltv={52}
      network="evm"
      utilization={70}
    />
  ),
};

export const WithdrawWETH_Compound: Story = {
  name: "Withdraw WETH (Compound)",
  render: () => (
    <TokenActionCard
      action="Withdraw"
      token={tokens.weth}
      protocolName="Compound"
      apyLabel="Supply APY"
      apy={2.1}
      metricLabel="Total supplied"
      before={5.0}
      balance={BigInt("5000000000000000000")}
      hf={2.8}
      ltv={40}
      network="evm"
      utilization={60}
    />
  ),
};

// --- BORROW STORIES ---

export const BorrowUSDC_Aave: Story = {
  name: "Borrow USDC (Aave)",
  render: () => (
    <TokenActionCard
      action="Borrow"
      token={tokens.usdc}
      protocolName="Aave"
      apyLabel="Borrow APY"
      apy={5.2}
      metricLabel="Total debt"
      before={500}
      balance={BigInt("3000000000")}
      hf={1.8}
      ltv={60}
      network="evm"
      utilization={75}
    />
  ),
};

export const BorrowWETH_Morpho: Story = {
  name: "Borrow WETH (Morpho)",
  render: () => (
    <TokenActionCard
      action="Borrow"
      token={tokens.weth}
      protocolName="Morpho"
      apyLabel="Borrow APY"
      apy={2.8}
      metricLabel="Total debt"
      before={0.5}
      balance={BigInt("2000000000000000000")}
      hf={1.9}
      ltv={55}
      network="evm"
      utilization={68}
    />
  ),
};

export const BorrowDAI_Venus: Story = {
  name: "Borrow DAI (Venus)",
  render: () => (
    <TokenActionCard
      action="Borrow"
      token={tokens.dai}
      protocolName="Venus"
      apyLabel="Borrow APY"
      apy={6.1}
      metricLabel="Total debt"
      before={1000}
      balance={BigInt("5000000000000000000000")}
      hf={2.2}
      ltv={48}
      network="evm"
      utilization={62}
    />
  ),
};

// --- REPAY STORIES ---

export const RepayUSDC_Aave: Story = {
  name: "Repay USDC (Aave)",
  render: () => (
    <TokenActionCard
      action="Repay"
      token={tokens.usdc}
      protocolName="Aave"
      apyLabel="Borrow APY"
      apy={5.2}
      metricLabel="Total debt"
      before={2500}
      balance={BigInt("3000000000")}
      hf={1.5}
      ltv={72}
      network="evm"
      utilization={85}
    />
  ),
};

export const RepayWETH_Compound: Story = {
  name: "Repay WETH (Compound)",
  render: () => (
    <TokenActionCard
      action="Repay"
      token={tokens.weth}
      protocolName="Compound"
      apyLabel="Borrow APY"
      apy={3.1}
      metricLabel="Total debt"
      before={1.2}
      balance={BigInt("2000000000000000000")}
      hf={1.7}
      ltv={65}
      network="evm"
      utilization={78}
    />
  ),
};

// --- RISK SCENARIO STORIES ---

export const LowHealthFactor: Story = {
  name: "Low Health Factor (Danger)",
  render: () => (
    <TokenActionCard
      action="Repay"
      token={tokens.usdc}
      protocolName="Aave"
      apyLabel="Borrow APY"
      apy={5.2}
      metricLabel="Total debt"
      before={5000}
      balance={BigInt("6000000000")}
      hf={1.15}
      ltv={85}
      network="evm"
      utilization={92}
    />
  ),
};

export const HighHealthFactor: Story = {
  name: "High Health Factor (Safe)",
  render: () => (
    <TokenActionCard
      action="Deposit"
      token={tokens.weth}
      protocolName="Compound"
      apyLabel="Supply APY"
      apy={2.1}
      metricLabel="Total supplied"
      before={10}
      balance={BigInt("5000000000000000000")}
      hf={5.5}
      ltv={18}
      network="evm"
      utilization={25}
    />
  ),
};

export const MaxedOutPosition: Story = {
  name: "Maxed Out Position",
  render: () => (
    <TokenActionCard
      action="Borrow"
      token={tokens.usdc}
      protocolName="Aave"
      apyLabel="Borrow APY"
      apy={5.2}
      metricLabel="Total debt"
      before={8000}
      balance={BigInt("500000000")}
      hf={1.25}
      ltv={80}
      network="evm"
      utilization={95}
    />
  ),
};

// =============================================================================
// SWAP MODAL MOCK (Collateral Swap / Debt Swap)
// =============================================================================

const SwapModalMock = ({
  title,
  fromToken,
  toToken,
  fromAmount,
  toAmount,
  priceImpact,
  route,
}: {
  title: string;
  fromToken: typeof tokens.usdc;
  toToken: typeof tokens.weth;
  fromAmount: string;
  toAmount: string;
  priceImpact: string;
  route: string;
}) => (
  <BaseModal isOpen={true} onClose={noop} title={title}>
    <div className="space-y-4">
      {/* From Token */}
      <div className="bg-base-200 rounded-lg p-4">
        <div className="text-base-content/60 mb-1 text-xs">From</div>
        <div className="flex items-center justify-between">
          <input
            type="text"
            value={fromAmount}
            readOnly
            className="w-32 bg-transparent text-2xl font-medium outline-none"
          />
          <div className="bg-base-300 flex items-center gap-2 rounded-full px-3 py-1">
            <img src={fromToken.icon} alt={fromToken.name} className="size-6 rounded-full" />
            <span className="font-medium">{fromToken.name}</span>
          </div>
        </div>
        <div className="text-base-content/50 mt-1 text-sm">
          ≈ ${(parseFloat(fromAmount) * (fromToken.usdPrice || 1)).toLocaleString()}
        </div>
      </div>

      {/* Arrow */}
      <div className="flex justify-center">
        <div className="bg-base-300 rounded-full p-2">
          <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </div>

      {/* To Token */}
      <div className="bg-base-200 rounded-lg p-4">
        <div className="text-base-content/60 mb-1 text-xs">To</div>
        <div className="flex items-center justify-between">
          <input
            type="text"
            value={toAmount}
            readOnly
            className="w-32 bg-transparent text-2xl font-medium outline-none"
          />
          <div className="bg-base-300 flex items-center gap-2 rounded-full px-3 py-1">
            <img src={toToken.icon} alt={toToken.name} className="size-6 rounded-full" />
            <span className="font-medium">{toToken.name}</span>
          </div>
        </div>
        <div className="text-base-content/50 mt-1 text-sm">
          ≈ ${(parseFloat(toAmount) * (toToken.usdPrice || 1)).toLocaleString()}
        </div>
      </div>

      {/* Swap Details */}
      <div className="bg-base-200/50 space-y-2 rounded-lg p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-base-content/60">Price Impact</span>
          <span className={parseFloat(priceImpact) > 1 ? "text-warning" : "text-success"}>{priceImpact}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-base-content/60">Route</span>
          <span>{route}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-base-content/60">Slippage</span>
          <span>0.5%</span>
        </div>
      </div>

      {/* Action Button */}
      <button className="btn btn-primary w-full">Swap Collateral</button>
    </div>
  </BaseModal>
);

export const CollateralSwap: StoryObj = {
  name: "Collateral Swap",
  render: () => (
    <SwapModalMock
      title="Swap Collateral"
      fromToken={tokens.weth}
      toToken={tokens.wbtc}
      fromAmount="2.5"
      toAmount="0.089"
      priceImpact="0.12%"
      route="1inch"
    />
  ),
  parameters: { layout: "fullscreen" },
};

export const DebtSwap: StoryObj = {
  name: "Debt Swap",
  render: () => (
    <SwapModalMock
      title="Swap Debt"
      fromToken={tokens.usdc}
      toToken={tokens.dai}
      fromAmount="5000"
      toAmount="4985"
      priceImpact="0.08%"
      route="Paraswap"
    />
  ),
  parameters: { layout: "fullscreen" },
};

// =============================================================================
// REFINANCE MODAL MOCK
// =============================================================================

const RefinanceModalMock = ({
  fromProtocol,
  toProtocol,
  collateralToken,
  debtToken,
  collateralAmount,
  debtAmount,
  currentApy,
  newApy,
}: {
  fromProtocol: string;
  toProtocol: string;
  collateralToken: typeof tokens.weth;
  debtToken: typeof tokens.usdc;
  collateralAmount: string;
  debtAmount: string;
  currentApy: number;
  newApy: number;
}) => (
  <BaseModal isOpen={true} onClose={noop} title="Refinance Position">
    <div className="space-y-4">
      {/* From/To Protocols */}
      <div className="bg-base-200 flex items-center justify-between rounded-lg p-3">
        <div className="text-center">
          <div className="text-base-content/60 mb-1 text-xs">From</div>
          <div className="text-error font-semibold">{fromProtocol}</div>
          <div className="text-base-content/50 text-xs">{currentApy}% APY</div>
        </div>
        <svg className="text-base-content/40 size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
        <div className="text-center">
          <div className="text-base-content/60 mb-1 text-xs">To</div>
          <div className="text-success font-semibold">{toProtocol}</div>
          <div className="text-base-content/50 text-xs">{newApy}% APY</div>
        </div>
      </div>

      {/* Savings */}
      <div className="alert alert-success">
        <span>Save {(currentApy - newApy).toFixed(2)}% APY by refinancing!</span>
      </div>

      {/* Position Details */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-base-content/60">Collateral</span>
          <div className="flex items-center gap-2">
            <img src={collateralToken.icon} alt={collateralToken.name} className="size-5 rounded-full" />
            <span className="font-medium">{collateralAmount} {collateralToken.name}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-base-content/60">Debt</span>
          <div className="flex items-center gap-2">
            <img src={debtToken.icon} alt={debtToken.name} className="size-5 rounded-full" />
            <span className="font-medium">{debtAmount} {debtToken.name}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-base-content/60">Flash Loan Provider</span>
          <span>Balancer</span>
        </div>
      </div>

      {/* Steps */}
      <div className="bg-base-200/50 rounded-lg p-3">
        <div className="text-base-content/60 mb-2 text-xs">Transaction steps:</div>
        <ol className="list-inside list-decimal space-y-1 text-sm">
          <li>Flash loan {debtAmount} {debtToken.name}</li>
          <li>Repay debt on {fromProtocol}</li>
          <li>Withdraw collateral from {fromProtocol}</li>
          <li>Deposit collateral to {toProtocol}</li>
          <li>Borrow to repay flash loan</li>
        </ol>
      </div>

      <button className="btn btn-primary w-full">Refinance Position</button>
    </div>
  </BaseModal>
);

export const RefinanceAaveToMorpho: StoryObj = {
  name: "Refinance Aave → Morpho",
  render: () => (
    <RefinanceModalMock
      fromProtocol="Aave"
      toProtocol="Morpho"
      collateralToken={tokens.weth}
      debtToken={tokens.usdc}
      collateralAmount="5.0"
      debtAmount="8,500"
      currentApy={5.2}
      newApy={3.8}
    />
  ),
  parameters: { layout: "fullscreen" },
};

export const RefinanceCompoundToAave: StoryObj = {
  name: "Refinance Compound → Aave",
  render: () => (
    <RefinanceModalMock
      fromProtocol="Compound"
      toProtocol="Aave"
      collateralToken={tokens.wbtc}
      debtToken={tokens.dai}
      collateralAmount="0.5"
      debtAmount="15,000"
      currentApy={6.1}
      newApy={4.5}
    />
  ),
  parameters: { layout: "fullscreen" },
};

// =============================================================================
// CLOSE POSITION WITH COLLATERAL MOCK
// =============================================================================

const ClosePositionMock = ({
  collateralToken,
  debtToken,
  collateralAmount,
  debtAmount,
  remainingCollateral,
}: {
  collateralToken: typeof tokens.weth;
  debtToken: typeof tokens.usdc;
  collateralAmount: string;
  debtAmount: string;
  remainingCollateral: string;
}) => (
  <BaseModal isOpen={true} onClose={noop} title="Close Position">
    <div className="space-y-4">
      <p className="text-base-content/70 text-sm">
        Close your position by selling collateral to repay debt.
      </p>

      {/* Current Position */}
      <div className="bg-base-200 space-y-3 rounded-lg p-4">
        <div className="text-base-content/60 text-xs uppercase tracking-wide">Current Position</div>
        <div className="flex items-center justify-between">
          <span>Collateral</span>
          <div className="flex items-center gap-2">
            <img src={collateralToken.icon} alt="" className="size-5 rounded-full" />
            <span className="font-medium">{collateralAmount} {collateralToken.name}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span>Debt</span>
          <div className="flex items-center gap-2">
            <img src={debtToken.icon} alt="" className="size-5 rounded-full" />
            <span className="text-error font-medium">{debtAmount} {debtToken.name}</span>
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="border-success/30 bg-success/10 rounded-lg border p-4">
        <div className="text-success mb-2 text-xs uppercase tracking-wide">After Closing</div>
        <div className="flex items-center justify-between">
          <span>You receive</span>
          <div className="flex items-center gap-2">
            <img src={collateralToken.icon} alt="" className="size-5 rounded-full" />
            <span className="text-success font-semibold">{remainingCollateral} {collateralToken.name}</span>
          </div>
        </div>
      </div>

      <button className="btn btn-error w-full">Close Position</button>
    </div>
  </BaseModal>
);

export const ClosePositionWithCollateral: StoryObj = {
  name: "Close Position with Collateral",
  render: () => (
    <ClosePositionMock
      collateralToken={tokens.weth}
      debtToken={tokens.usdc}
      collateralAmount="3.5"
      debtAmount="5,000"
      remainingCollateral="2.07"
    />
  ),
  parameters: { layout: "fullscreen" },
};

// =============================================================================
// MULTIPLY / LEVERAGE MODAL MOCK
// =============================================================================

const MultiplyModalMock = ({
  collateralToken,
  debtToken,
  initialAmount,
  leverage,
  finalExposure,
  liquidationPrice,
}: {
  collateralToken: typeof tokens.weth;
  debtToken: typeof tokens.usdc;
  initialAmount: string;
  leverage: string;
  finalExposure: string;
  liquidationPrice: string;
}) => (
  <BaseModal isOpen={true} onClose={noop} title="Multiply Position">
    <div className="space-y-4">
      {/* Initial Deposit */}
      <div className="bg-base-200 rounded-lg p-4">
        <div className="text-base-content/60 mb-2 text-xs">Initial Deposit</div>
        <div className="flex items-center gap-3">
          <img src={collateralToken.icon} alt="" className="size-8 rounded-full" />
          <div>
            <div className="text-lg font-semibold">{initialAmount} {collateralToken.name}</div>
            <div className="text-base-content/50 text-sm">
              ≈ ${(parseFloat(initialAmount) * (collateralToken.usdPrice || 1)).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Leverage Slider */}
      <div>
        <div className="mb-2 flex justify-between text-sm">
          <span className="text-base-content/60">Leverage</span>
          <span className="font-semibold">{leverage}x</span>
        </div>
        <input
          type="range"
          min="1"
          max="5"
          value={parseFloat(leverage)}
          className="range range-primary"
          readOnly
        />
        <div className="text-base-content/50 mt-1 flex justify-between text-xs">
          <span>1x</span>
          <span>5x</span>
        </div>
      </div>

      {/* Result */}
      <div className="border-primary/30 bg-primary/10 space-y-3 rounded-lg border p-4">
        <div className="flex justify-between">
          <span className="text-base-content/60">Final Exposure</span>
          <span className="font-semibold">{finalExposure} {collateralToken.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-base-content/60">Debt</span>
          <span className="text-error">{debtToken.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-base-content/60">Liquidation Price</span>
          <span className="text-warning">${liquidationPrice}</span>
        </div>
      </div>

      <button className="btn btn-primary w-full">Open Multiply Position</button>
    </div>
  </BaseModal>
);

export const MultiplyWETH: StoryObj = {
  name: "Multiply WETH (3x)",
  render: () => (
    <MultiplyModalMock
      collateralToken={tokens.weth}
      debtToken={tokens.usdc}
      initialAmount="2.0"
      leverage="3"
      finalExposure="6.0"
      liquidationPrice="2,100"
    />
  ),
  parameters: { layout: "fullscreen" },
};

export const MultiplyWBTC: StoryObj = {
  name: "Multiply WBTC (2x)",
  render: () => (
    <MultiplyModalMock
      collateralToken={tokens.wbtc}
      debtToken={tokens.usdc}
      initialAmount="0.5"
      leverage="2"
      finalExposure="1.0"
      liquidationPrice="58,000"
    />
  ),
  parameters: { layout: "fullscreen" },
};

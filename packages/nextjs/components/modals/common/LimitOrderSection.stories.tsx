import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  ChunkInfo,
  BatchedTxToggle,
  LimitOrderInfoNote,
} from "./LimitOrderSection";

// ============================================================================
// ChunkInfo Stories
// ============================================================================

const chunkInfoMeta: Meta<typeof ChunkInfo> = {
  title: "Modals/LimitOrder/ChunkInfo",
  component: ChunkInfo,
  parameters: {
    layout: "centered",
  },
};

export default chunkInfoMeta;

export const TwoChunks: StoryObj<typeof ChunkInfo> = {
  args: {
    numChunks: 2,
  },
  render: (args) => (
    <div className="bg-base-200 w-80 rounded-lg p-4">
      <ChunkInfo {...args} />
    </div>
  ),
};

export const FiveChunks: StoryObj<typeof ChunkInfo> = {
  args: {
    numChunks: 5,
  },
  render: (args) => (
    <div className="bg-base-200 w-80 rounded-lg p-4">
      <ChunkInfo {...args} />
    </div>
  ),
};

export const ManyChunks: StoryObj<typeof ChunkInfo> = {
  args: {
    numChunks: 10,
  },
  render: (args) => (
    <div className="bg-base-200 w-80 rounded-lg p-4">
      <ChunkInfo {...args} />
    </div>
  ),
};

// ============================================================================
// BatchedTxToggle Stories
// ============================================================================

const BatchedTxToggleWrapper = ({ defaultValue = false }: { defaultValue?: boolean }) => {
  const [useBatchedTx, setUseBatchedTx] = useState(defaultValue);
  return (
    <div className="bg-base-200 w-80 rounded-lg p-4">
      <BatchedTxToggle useBatchedTx={useBatchedTx} setUseBatchedTx={setUseBatchedTx} />
    </div>
  );
};

export const BatchedToggleOff: StoryObj = {
  render: () => <BatchedTxToggleWrapper defaultValue={false} />,
};

export const BatchedToggleOn: StoryObj = {
  render: () => <BatchedTxToggleWrapper defaultValue={true} />,
};

// ============================================================================
// LimitOrderInfoNote Stories
// ============================================================================

export const InfoNoteSingleTx: StoryObj<typeof LimitOrderInfoNote> = {
  render: () => (
    <div className="bg-base-200 w-80 rounded-lg p-4">
      <LimitOrderInfoNote numChunks={1} />
    </div>
  ),
};

export const InfoNoteMultiChunk: StoryObj<typeof LimitOrderInfoNote> = {
  render: () => (
    <div className="bg-base-200 w-80 rounded-lg p-4">
      <LimitOrderInfoNote numChunks={3} />
    </div>
  ),
};

// ============================================================================
// LimitOrderSection Stories (Mocked - no wagmi)
// ============================================================================

// Mock component that simulates LimitOrderSection without wagmi dependencies
const MockLimitOrderSection = ({
  showLoading = false,
  showSlippage = false,
  showBatchedToggle = false,
  showMultiChunk = false,
}: {
  showLoading?: boolean;
  showSlippage?: boolean;
  showBatchedToggle?: boolean;
  showMultiChunk?: boolean;
}) => {
  const [slippage, setSlippage] = useState(1);
  const [useBatchedTx, setUseBatchedTx] = useState(false);
  const numChunks = showMultiChunk ? 3 : 1;

  return (
    <div className="bg-base-100 w-96 rounded-lg p-4">
      <div className="bg-base-200/50 space-y-2 rounded-lg p-3">
        <div className="text-base-content/70 flex items-center gap-1 text-xs font-medium">
          <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Limit Order Configuration
        </div>

        {/* Simulated Provider Selector */}
        <div className="flex items-center justify-between">
          <span className="text-base-content/60 text-xs">Flash Loan Provider</span>
          <div className="flex gap-1">
            <button className="btn btn-primary btn-xs">
              Morpho
              <span className="text-success ml-1 text-[9px]">0%</span>
            </button>
            <button className="btn btn-ghost btn-xs opacity-60 hover:opacity-100">
              Balancer
              <span className="text-success ml-1 text-[9px]">0%</span>
            </button>
            <button className="btn btn-ghost btn-xs opacity-60 hover:opacity-100">
              Aave
            </button>
          </div>
        </div>

        {/* Simulated Chunks Input */}
        <div className="flex items-center justify-between">
          <span className="text-base-content/60 text-xs">Chunks</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={999}
              value={numChunks}
              readOnly
              className="input input-bordered input-xs w-16 text-right"
            />
            {numChunks > 1 && (
              <span className="text-base-content/50 text-[10px]">
                ~3,333.33 USDC/chunk
              </span>
            )}
          </div>
        </div>

        {/* Flash Loan Explanation */}
        <div className="flex items-start gap-1.5 text-[10px]">
          <svg className="text-success mt-0.5 size-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <div>
            <span className="text-success font-medium">
              {numChunks === 1 ? "Single transaction execution" : `${numChunks} flash loan transactions`}
            </span>
            <p className="text-base-content/50 mt-0.5">
              {numChunks === 1
                ? "Solver takes flash loan, swaps, you borrow to repay. All in one tx."
                : "Each chunk executes as independent flash loan. ~30 min between chunks for price discovery."
              }
              {" No flash loan fee."}
            </p>
          </div>
        </div>

        {/* Chunk Info */}
        {showMultiChunk && <ChunkInfo numChunks={numChunks} />}

        {/* Loading State */}
        {showLoading && (
          <div className="text-base-content/60 mt-2 flex items-center gap-2 text-xs">
            <span className="loading loading-spinner loading-xs" />
            Fetching CoW quote...
          </div>
        )}

        {/* Slippage */}
        {showSlippage && (
          <div className="border-base-300/30 flex items-center justify-between border-t px-1 pt-2 text-xs">
            <span className="text-base-content/70">Slippage Buffer</span>
            <div className="flex items-center gap-2">
              <span>{slippage}%</span>
              <button className="btn btn-ghost btn-xs" onClick={() => setSlippage(s => s === 1 ? 2 : 1)}>
                <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Batched TX Toggle */}
        {showBatchedToggle && (
          <BatchedTxToggle useBatchedTx={useBatchedTx} setUseBatchedTx={setUseBatchedTx} />
        )}
      </div>
    </div>
  );
};

export const DefaultConfiguration: StoryObj = {
  render: () => <MockLimitOrderSection />,
};

export const WithLoadingQuote: StoryObj = {
  render: () => <MockLimitOrderSection showLoading />,
};

export const WithSlippage: StoryObj = {
  render: () => <MockLimitOrderSection showSlippage />,
};

export const WithBatchedToggle: StoryObj = {
  render: () => <MockLimitOrderSection showBatchedToggle />,
};

export const MultiChunkConfiguration: StoryObj = {
  render: () => <MockLimitOrderSection showMultiChunk />,
};

export const FullFeatured: StoryObj = {
  render: () => (
    <MockLimitOrderSection
      showSlippage
      showBatchedToggle
      showMultiChunk
    />
  ),
};

// ============================================================================
// Provider Selection States
// ============================================================================

const ProviderStatesDemo = () => (
  <div className="bg-base-100 flex flex-col gap-4 p-4">
    {/* Provider with sufficient liquidity */}
    <div className="bg-base-200/50 rounded-lg p-3">
      <div className="mb-2 text-xs font-medium">Provider with Liquidity</div>
      <div className="flex gap-1">
        <button className="btn btn-primary btn-xs">
          Morpho
          <span className="text-success ml-1 text-[9px]">0%</span>
        </button>
        <button className="btn btn-ghost btn-xs opacity-60">
          Balancer
        </button>
      </div>
    </div>

    {/* Provider with insufficient liquidity */}
    <div className="bg-base-200/50 rounded-lg p-3">
      <div className="mb-2 text-xs font-medium">Provider Warning (Low Liquidity)</div>
      <div className="flex gap-1">
        <button className="btn btn-warning btn-xs">
          Morpho
          <span className="text-warning ml-1 text-[9px]">!</span>
        </button>
        <button className="btn btn-ghost btn-xs opacity-60">
          Aave
        </button>
      </div>
      <div className="text-warning mt-2 flex items-start gap-1.5 text-[10px]">
        <svg className="mt-0.5 size-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>
          Morpho may not have enough USDC liquidity. Try another provider.
        </span>
      </div>
    </div>

    {/* Provider with no liquidity (crossed out) */}
    <div className="bg-base-200/50 rounded-lg p-3">
      <div className="mb-2 text-xs font-medium">Provider No Liquidity</div>
      <div className="flex gap-1">
        <button className="btn btn-primary btn-xs">
          Aave
        </button>
        <button className="btn btn-ghost btn-xs line-through opacity-40">
          Morpho
          <span className="text-warning ml-1 text-[9px]">!</span>
        </button>
      </div>
    </div>

    {/* Loading liquidity state */}
    <div className="bg-base-200/50 rounded-lg p-3">
      <div className="mb-2 text-xs font-medium">Loading Liquidity</div>
      <div className="flex items-center gap-1">
        <span className="text-base-content/60 text-xs">Flash Loan Provider</span>
        <span className="loading loading-spinner loading-xs opacity-50" />
      </div>
    </div>
  </div>
);

export const ProviderStates: StoryObj = {
  render: () => <ProviderStatesDemo />,
};

// ============================================================================
// Integration Example (how it looks in a modal)
// ============================================================================

const ModalIntegrationExample = () => (
  <div className="bg-base-100 w-[420px] rounded-xl p-6 shadow-xl">
    <h3 className="mb-4 text-lg font-semibold">Debt Swap - Limit Order</h3>

    {/* Swap Info */}
    <div className="bg-base-200/50 mb-4 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-primary/20 flex size-8 items-center justify-center rounded-full text-sm">$</div>
          <div>
            <div className="font-medium">10,000 USDC</div>
            <div className="text-base-content/60 text-xs">Debt to swap</div>
          </div>
        </div>
        <svg className="text-base-content/40 size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
        <div className="flex items-center gap-2">
          <div className="bg-secondary/20 flex size-8 items-center justify-center rounded-full text-sm">D</div>
          <div>
            <div className="font-medium">~9,980 DAI</div>
            <div className="text-base-content/60 text-xs">Expected output</div>
          </div>
        </div>
      </div>
    </div>

    {/* Limit Order Config */}
    <MockLimitOrderSection showSlippage showBatchedToggle />

    {/* Action Button */}
    <button className="btn btn-primary mt-4 w-full">
      Create Limit Order
    </button>
  </div>
);

export const InModalContext: StoryObj = {
  render: () => <ModalIntegrationExample />,
};

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MorphoProtocolView } from "../MorphoProtocolView";

const mocks = vi.hoisted(() => ({
  lendingPositions: vi.fn(),
  refetchApiPositions: vi.fn(),
  refetchMarkets: vi.fn(),
  refetchBrowseMarkets: vi.fn(),
  refetchOnChainPositions: vi.fn(),
  setProtocolTotals: vi.fn(),
  findYield: vi.fn(),
}));
vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: "0x0000000000000000000000000000000000000001",
    chainId: 8453,
  }),
}));
vi.mock("~~/hooks/useMorphoLendingPositions", () => ({
  useMorphoLendingPositions: mocks.lendingPositions,
  useMorphoMarkets: () => ({
    marketPairs: [],
    markets: [],
    isLoading: false,
    refetch: mocks.refetchBrowseMarkets,
  }),
}));
vi.mock("~~/hooks/useMorphoPositionsRefresh", () => ({
  useMorphoPositionsRefresh: () => ({
    rows: [],
    isFetching: false,
    isLoading: false,
    refetch: mocks.refetchOnChainPositions,
  }),
}));
vi.mock("~~/hooks/useExternalYields", () => ({
  useExternalYields: () => ({ findYield: mocks.findYield }),
  hasExternalYield: () => false,
}));
vi.mock("~~/hooks/common", () => ({ useTxCompletedListenerDelayed: () => undefined }));
vi.mock("~~/utils/forkChain", () => ({ getEffectiveChainId: (chainId: number) => chainId }));
vi.mock("~~/contexts/DashboardTotalsContext", () => ({
  useSetProtocolTotals: () => mocks.setProtocolTotals,
}));
vi.mock("~~/components/specific/common", () => ({
  BaseProtocolHeader: ({ onToggleCollapsed }: { onToggleCollapsed: () => void }) => (
    <button type="button" onClick={onToggleCollapsed}>
      Toggle Morpho
    </button>
  ),
}));
vi.mock("~~/components/common/CollapsibleSection", () => ({
  CollapsibleSection: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
vi.mock("~~/components/specific/morpho/MorphoPositionsSection", () => ({
  MorphoPositionsSection: ({
    rows,
    hasLoadedOnce,
  }: {
    rows: Array<{
      key: string;
    }>;
    hasLoadedOnce: boolean;
  }) => {
    if (!hasLoadedOnce) {
      return <p role="status">Loading variable-rate positions</p>;
    }

    return (
      <section aria-label="Variable-rate positions">
        {rows.length ? rows.map(row => <p key={row.key}>{row.key}</p>) : <p>No variable-rate positions</p>}
      </section>
    );
  },
}));
vi.mock("~~/components/specific/morpho/MorphoMarketsSection", () => ({ MorphoMarketsSection: () => null }));
function lendingResult(overrides: Record<string, unknown> = {}) {
  return {
    markets: [],
    rows: [],
    isLoadingPositions: false,
    hasLoadedOnce: false,
    isUpdating: false,
    positionsError: new Error("Failed to fetch positions"),
    refetchPositions: mocks.refetchApiPositions,
    refetchMarkets: mocks.refetchMarkets,
    ...overrides,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lendingPositions.mockReturnValue(lendingResult());
});

afterEach(cleanup);
describe("Morpho variable-position loading failures", () => {
  it("shows an alert while collapsed and retries the API rather than the fast on-chain refresh", () => {
    render(<MorphoProtocolView chainId={8453} />);
    expect(screen.getByRole("alert").textContent).toContain("Variable-rate positions could not be loaded.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetchApiPositions).toHaveBeenCalledOnce();
    expect(mocks.refetchOnChainPositions).not.toHaveBeenCalled();
  });
  it("does not show an empty account after a failed fetch, even when expanded", () => {
    render(<MorphoProtocolView chainId={8453} />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Morpho" }));
    expect(screen.queryByRole("region", { name: "Variable-rate positions" })).toBeNull();
    expect(screen.queryByText("No variable-rate positions")).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
  it("keeps previously loaded rows visible when a refresh fails", () => {
    mocks.lendingPositions.mockReturnValue(
      lendingResult({
        hasLoadedOnce: true,
        rows: [
          {
            key: "Existing cbBTC position",
            market: { collateralAsset: { address: "0x0000000000000000000000000000000000000002" } },
            collateralSymbol: "cbBTC",
            collateralBalanceUsd: 200,
            hasDebt: true,
            borrowBalanceUsd: 100,
            borrowApy: 0.05,
          },
        ],
      }),
    );
    render(<MorphoProtocolView chainId={8453} />);
    expect(screen.getByRole("region", { name: "Variable-rate positions" })).toBeTruthy();
    expect(screen.getByText("Existing cbBTC position")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Showing the last available data.");
  });
  it("keeps a retry pending until the current positions query has returned data", () => {
    const { rerender } = render(<MorphoProtocolView chainId={8453} />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Morpho" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    mocks.lendingPositions.mockReturnValue(
      lendingResult({
        positionsError: null,
        hasLoadedOnce: false,
        isLoadingPositions: true,
        isUpdating: true,
      }),
    );
    rerender(<MorphoProtocolView chainId={8453} />);
    expect(screen.getByRole("status").textContent).toContain("Loading variable-rate positions");
    expect(screen.queryByText("No variable-rate positions")).toBeNull();

    // A paused retry can stop actively fetching before any result exists.
    mocks.lendingPositions.mockReturnValue(
      lendingResult({
        positionsError: null,
        hasLoadedOnce: false,
        isLoadingPositions: false,
        isUpdating: false,
      }),
    );
    rerender(<MorphoProtocolView chainId={8453} />);
    expect(screen.getByRole("status").textContent).toContain("Loading variable-rate positions");
    expect(screen.queryByText("No variable-rate positions")).toBeNull();

    mocks.lendingPositions.mockReturnValue(
      lendingResult({
        positionsError: null,
        hasLoadedOnce: true,
      }),
    );
    rerender(<MorphoProtocolView chainId={8453} />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Morpho" }));
    expect(screen.getByText("No variable-rate positions")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("still renders a successful empty result without a failure alert", () => {
    mocks.lendingPositions.mockReturnValue(
      lendingResult({
        hasLoadedOnce: true,
        positionsError: null,
      }),
    );
    render(<MorphoProtocolView chainId={8453} />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle Morpho" }));
    expect(screen.getByText("No variable-rate positions")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

it("retries both market queries after a market retrieval error", () => {
  mocks.lendingPositions.mockReturnValue(lendingResult({
    positionsError: null,
    marketsError: new Error("Markets unavailable"),
  }));
  render(<MorphoProtocolView chainId={8453} />);
  expect(screen.getByRole("alert").textContent).toContain("Morpho markets could not be loaded");
  fireEvent.click(screen.getByRole("button", { name: "Retry markets" }));
  expect(mocks.refetchMarkets).toHaveBeenCalledOnce();
  expect(mocks.refetchBrowseMarkets).toHaveBeenCalledOnce();
});

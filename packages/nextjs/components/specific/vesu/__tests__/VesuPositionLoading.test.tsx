import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VesuPositionsSection } from "../VesuPositionsSection";
import { VesuProtocolView } from "../VesuProtocolView";
import { VESU_V2_POOLS } from "../pools";
import { normalizeStarknetAddress } from "~~/utils/vesu";

const mocks = vi.hoisted(() => ({
  setProtocolTotals: vi.fn(),
  refetchPositions: vi.fn(),
  refetchAssets: vi.fn(),
  incompletePool: undefined as string | undefined,
  poolError: undefined as Error | undefined,
  assetError: undefined as Error | undefined,
  loadingAssets: false,
  knownRows: false,
}));

vi.mock("~~/contexts/DashboardTotalsContext", () => ({ useSetProtocolTotals: () => mocks.setProtocolTotals }));
vi.mock("~~/hooks/useAccount", () => ({
  useAccount: () => ({ viewingAddress: "0xabc", status: "connected", isViewingOtherAddress: false }),
}));
vi.mock("~~/hooks/common", () => ({ useTxCompletedListener: () => {} }));
vi.mock("~~/contracts/externalContracts", () => ({ tokenNameToLogo: () => "" }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("../VesuMarketSection", () => ({ VesuMarketSection: () => null }));
vi.mock("~~/components/SupplyPosition", () => ({ SupplyPosition: () => <div data-testid="supply-position" /> }));
vi.mock("~~/components/BorrowPosition", () => ({ BorrowPosition: () => null }));
vi.mock("~~/utils/position", () => ({ PositionManager: { fromPositions: () => ({}) } }));
vi.mock("~~/components/modals/stark/ClosePositionModalStark", () => ({ ClosePositionModalStark: () => null }));
vi.mock("~~/components/modals/stark/TokenSelectModalStark", () => ({ TokenSelectModalStark: () => null }));
vi.mock("~~/components/modals/stark/SwitchTokenSelectModalStark", () => ({ default: () => null }));
vi.mock("~~/components/modals/stark/SwitchDebtModalStark", () => ({ SwitchDebtModalStark: () => null }));
vi.mock("~~/components/modals/stark/SwitchCollateralModalStark", () => ({ SwitchCollateralModalStark: () => null }));
vi.mock("~~/components/common/Loading", () => ({ LoadingSpinner: () => <div role="status">Loading positions</div> }));
vi.mock("~~/hooks/useVesuLendingPositions", () => ({ useVesuLendingPositions: () => poolData() }));
vi.mock("~~/hooks/useVesuV2LendingPositions", () => ({
  useVesuV2LendingPositions: (_address: string, pool: string) => poolData(pool),
}));

const poolData = (pool?: string) => ({
  assetsWithRates: [],
  suppliablePositions: [],
  borrowablePositions: [],
  rows: mocks.knownRows ? [{
    key: "known-position",
    supply: { balance: 100, currentRate: 0, tokenAddress: "0x1", name: "ETH" },
    hasDebt: false,
  }] : [],
  hasLoadedOnce: pool !== mocks.incompletePool || !pool,
  isUpdating: false,
  isLoadingPositions: false,
  isLoadingAssets: mocks.loadingAssets,
  assetsError: mocks.assetError,
  positionsError: pool === mocks.incompletePool ? mocks.poolError : undefined,
  refetchPositions: mocks.refetchPositions,
  refetchAssets: mocks.refetchAssets,
});

const sectionProps = {
  rows: [],
  assetsWithRates: [],
  userAddress: "0xabc",
  accountStatus: "connected",
  hasLoadedOnce: false,
  isUpdating: false,
  onBorrowRequest: vi.fn(),
  onDepositRequest: vi.fn(),
  onRetryPositions: mocks.refetchPositions,
  netBalanceUsd: 0,
  netYield30d: 0,
  netApyPercent: null,
  formatCurrency: (value: number) => `$${value}`,
};

beforeEach(() => {
  mocks.setProtocolTotals.mockReset();
  mocks.refetchPositions.mockReset();
  mocks.refetchAssets.mockReset();
  mocks.incompletePool = undefined;
  mocks.poolError = undefined;
  mocks.assetError = undefined;
  mocks.loadingAssets = false;
  mocks.knownRows = false;
});

describe("Vesu position loading feedback", () => {
  it("shows a retryable error instead of an endless spinner or false empty balance", () => {
    render(<VesuPositionsSection {...sectionProps} positionsError={new Error("RPC unavailable")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load all positions");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("No positions found")).not.toBeInTheDocument();
    expect(screen.queryByText("Balance:")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetchPositions).toHaveBeenCalledOnce();
  });

  it("shows loading until complete, then displays a successful empty result", () => {
    const { rerender } = render(<VesuPositionsSection {...sectionProps} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading positions");
    expect(screen.queryByText("No positions found")).not.toBeInTheDocument();
    rerender(<VesuPositionsSection {...sectionProps} hasLoadedOnce />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("No positions found")).toBeInTheDocument();
  });

  it("identifies a failed background refresh while keeping the available result", () => {
    render(<VesuPositionsSection {...sectionProps} hasLoadedOnce positionsError={new Error("RPC unavailable")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Showing the last available data");
    expect(screen.getByText("No positions found")).toBeInTheDocument();
    expect(screen.getByText("Balance:")).toBeInTheDocument();
  });
});

describe("Vesu dashboard completion", () => {
  it("publishes successful empty totals after every pool finishes", () => {
    render(<VesuProtocolView />);
    expect(mocks.setProtocolTotals).toHaveBeenCalledWith("Vesu", 0, 0);
  });

  it("does not publish incomplete pools and resumes when the missing pool finishes", () => {
    mocks.incompletePool = normalizeStarknetAddress(VESU_V2_POOLS.Re7xBTC);
    const { rerender } = render(<VesuProtocolView />);
    expect(mocks.setProtocolTotals).not.toHaveBeenCalled();
    mocks.incompletePool = undefined;
    rerender(<VesuProtocolView />);
    expect(mocks.setProtocolTotals).toHaveBeenCalledWith("Vesu", 0, 0);
  });

  it("exposes a failed non-default pool with retry and does not publish complete totals", () => {
    mocks.incompletePool = normalizeStarknetAddress(VESU_V2_POOLS.Re7xBTC);
    mocks.poolError = new Error("RPC unavailable");
    render(<VesuProtocolView />);
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load all positions");
    expect(mocks.setProtocolTotals).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetchPositions).toHaveBeenCalledOnce();
  });

  it.each(["loading", "error"])("does not publish when assets are %s", state => {
    mocks.loadingAssets = state === "loading";
    mocks.assetError = state === "error" ? new Error("asset prices unavailable") : undefined;
    render(<VesuProtocolView />);
    expect(mocks.setProtocolTotals).not.toHaveBeenCalled();
  });

  it("keeps position sections loading until asset metadata is available", () => {
    mocks.loadingAssets = true;
    const { rerender } = render(<VesuProtocolView />);
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.queryByText("No positions found")).not.toBeInTheDocument();
    expect(screen.queryByText("Balance:")).not.toBeInTheDocument();
    mocks.loadingAssets = false;
    rerender(<VesuProtocolView />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getAllByText("No positions found")).toHaveLength(2);
  });

  it("shows failed asset metadata as unavailable and retries positions and assets", () => {
    mocks.assetError = new Error("asset metadata unavailable");
    render(<VesuProtocolView />);
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("Your balance is unavailable");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("No positions found")).not.toBeInTheDocument();
    expect(screen.queryByText("Balance:")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);
    expect(mocks.refetchPositions).toHaveBeenCalledOnce();
    expect(mocks.refetchAssets).toHaveBeenCalledOnce();
  });

  it("keeps known balances visible during a background asset refresh", () => {
    mocks.knownRows = true;
    const { rerender } = render(<VesuProtocolView />);
    expect(screen.getAllByTestId("supply-position")).toHaveLength(9);
    mocks.loadingAssets = true;
    rerender(<VesuProtocolView />);
    expect(screen.getAllByTestId("supply-position")).toHaveLength(9);
    expect(screen.getAllByText("Balance:")).toHaveLength(9);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

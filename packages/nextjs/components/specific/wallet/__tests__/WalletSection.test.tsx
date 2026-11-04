// @vitest-environment jsdom
import { WalletSection } from "../WalletSection";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WalletToken } from "~~/hooks/useWalletTokens";

const mocks = vi.hoisted(() => {
  return {
    wallet: vi.fn(),
    refetch: vi.fn(),
    setProtocolTotals: vi.fn(),
  };
});

vi.mock("~~/hooks/useWalletTokens", () => ({ useWalletTokens: mocks.wallet }));
vi.mock("~~/contexts/DashboardTotalsContext", () => ({
  useSetProtocolTotals: () => mocks.setProtocolTotals,
}));
vi.mock("~~/hooks/common/useTxCompletedListener", () => ({ useTxCompletedListenerDelayed: () => {} }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("~~/components/common/TokenDisplay", () => ({ TokenIcon: () => null }));
vi.mock("~~/components/common/TokenSymbolDisplay", () => ({
  TokenSymbolDisplay: ({ symbol }: { symbol: string }) => <span>{symbol}</span>,
}));
vi.mock("~~/utils/chainFeatures", () => ({ is1inchSupported: () => true }));

const token: WalletToken = {
  address: "0x0a1a1a107e45b7ced86833863f482bc5f4ed82ef",
  symbol: "USDai",
  name: "USDai",
  decimals: 18,
  balance: 25n * 10n ** 18n,
  balanceFormatted: 25,
  usdValue: 25,
  price: 1,
  icon: "/token.svg",
  source: "major",
  valuationAvailable: true,
};
const indexedToken: WalletToken = {
  ...token,
  address: "0x1111111111111111111111111111111111111111",
  symbol: "NEW",
  name: "New token",
  balance: 7n * 10n ** 18n,
  balanceFormatted: 7,
  usdValue: 7,
  source: "indexed",
};
const unresolved = {
  address: "0x2222222222222222222222222222222222222222",
  rawBalance: "2678",
  reason: "decimals",
};

function walletResult(overrides: Record<string, unknown> = {}) {
  return {
    tokens: [token],
    isLoading: false,
    isError: false,
    isDiscoveryIncomplete: false,
    totalValue: 25,
    refetch: mocks.refetch,
    unresolvedHoldings: [],
    valuationAvailable: true,
    visibilityScope: "42161:wallet-one",
    ...overrides,
  };
}

function walletHeader() {
  return screen.getByRole("button", { name: "Toggle wallet holdings" });
}

function openGroup(label: string) {
  const summary = screen.getByText(label, { selector: "summary" });
  fireEvent.click(summary);
  const group = summary.closest("details")!;
  expect(group.open).toBe(true);
  return group;
}

function openDetails(label: string, container: HTMLElement = document.body) {
  const button = within(container).getByRole("button", { name: `Details for ${label}` });
  fireEvent.click(button);
  expect(button.getAttribute("aria-expanded")).toBe("true");
}

function hideToken(label: string) {
  openDetails(label);
  fireEvent.click(screen.getByRole("button", { name: `Hide ${label}` }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.wallet.mockReturnValue(walletResult());
});
afterEach(cleanup);

it("shows the known balance and reports a complete portfolio contribution", () => {
  render(<WalletSection chainId={42161} defaultExpanded />);
  expect(walletHeader().textContent).toContain("Balance$25.00");
  expect(screen.getByText("USDai")).toBeTruthy();
  expect(mocks.setProtocolTotals).toHaveBeenCalledWith("Wallet", 25, 0);
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByRole("button", { name: "Hide USDai" })).toBeNull();
});

it("preserves the list, subtotal and expanded token details during enrichment", () => {
  const { rerender } = render(<WalletSection chainId={42161} defaultExpanded />);
  openDetails("USDai");
  mocks.setProtocolTotals.mockClear();
  mocks.wallet.mockReturnValue(walletResult({ isLoading: true }));
  rerender(<WalletSection chainId={42161} defaultExpanded />);

  expect(screen.getByText("USDai")).toBeTruthy();
  expect(walletHeader().textContent).toContain("$25.00");
  expect(screen.getByRole("button", { name: "Details for USDai" }).getAttribute("aria-expanded")).toBe("true");
  expect(mocks.setProtocolTotals).not.toHaveBeenCalled();
});

it("waits for refreshed balances before publishing a changed subtotal", () => {
  const { rerender } = render(<WalletSection chainId={42161} defaultExpanded />);
  mocks.setProtocolTotals.mockClear();
  const refreshedToken = {
    ...token,
    usdValue: 30,
  };
  mocks.wallet.mockReturnValue(walletResult({ tokens: [refreshedToken], isRefreshing: true }));
  rerender(<WalletSection chainId={42161} defaultExpanded />);
  expect(screen.getByText("USDai")).toBeTruthy();
  expect(mocks.setProtocolTotals).not.toHaveBeenCalled();

  mocks.wallet.mockReturnValue(walletResult({ tokens: [refreshedToken], isRefreshing: false }));
  rerender(<WalletSection chainId={42161} defaultExpanded />);
  expect(mocks.setProtocolTotals).toHaveBeenCalledWith("Wallet", 30, 0);
});

it.each([false, true])("shows partial balances with a compact retry status when expanded=%s", expanded => {
  mocks.wallet.mockReturnValue(
    walletResult({
      isError: true,
      isDiscoveryIncomplete: true,
    }),
  );
  render(<WalletSection chainId={42161} defaultExpanded={expanded} />);
  expect(screen.getByRole("status").textContent).toContain("Showing available balances");
  expect(walletHeader().textContent).toContain("Known value$25.00");
  expect(mocks.setProtocolTotals).not.toHaveBeenCalled();
});

it.each([false, true])("does not call an empty failed scan a zero wallet when expanded=%s", expanded => {
  mocks.wallet.mockReturnValue(
    walletResult({
      tokens: [],
      totalValue: 0,
      isError: true,
      isDiscoveryIncomplete: true,
    }),
  );
  render(<WalletSection chainId={42161} defaultExpanded={expanded} />);
  expect(screen.getByRole("status").textContent).toContain("Couldn't load your wallet holdings");
  expect(walletHeader().textContent).toContain("Known value—");
  expect(screen.queryByText("No tokens found in wallet")).toBeNull();
  expect(mocks.setProtocolTotals).not.toHaveBeenCalled();
});

it("retries discovery and removes its status when the complete scan recovers", () => {
  mocks.wallet.mockReturnValue(
    walletResult({
      isError: true,
      isDiscoveryIncomplete: true,
    }),
  );
  const { rerender } = render(<WalletSection chainId={42161} defaultExpanded />);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(mocks.refetch).toHaveBeenCalledOnce();
  mocks.wallet.mockReturnValue(walletResult());
  rerender(<WalletSection chainId={42161} defaultExpanded />);
  expect(screen.queryByRole("status")).toBeNull();
  expect(walletHeader().textContent).toContain("Balance$25.00");
  expect(mocks.setProtocolTotals).toHaveBeenCalledWith("Wallet", 25, 0);
});

it("keeps an empty successful wallet distinct from a failed scan", () => {
  mocks.wallet.mockReturnValue(
    walletResult({
      tokens: [],
      totalValue: 0,
    }),
  );
  render(<WalletSection chainId={42161} defaultExpanded />);
  expect(screen.getByText("No tokens found in wallet")).toBeTruthy();
  expect(walletHeader().textContent).toContain("Balance$0.00");
  expect(mocks.setProtocolTotals).toHaveBeenCalledWith("Wallet", 0, 0);
});

it("does not replace the last complete aggregate with partial data", () => {
  const { rerender } = render(<WalletSection chainId={42161} />);
  mocks.setProtocolTotals.mockClear();
  mocks.wallet.mockReturnValue(
    walletResult({
      tokens: [
        {
          ...token,
          usdValue: 5,
        },
      ],
      totalValue: 5,
      isError: true,
      isDiscoveryIncomplete: true,
    }),
  );
  rerender(<WalletSection chainId={42161} />);
  expect(walletHeader().textContent).toContain("Known value$5.00");
  expect(mocks.setProtocolTotals).not.toHaveBeenCalled();
});

it("preserves the known subtotal when other holdings have missing prices or precision", () => {
  mocks.wallet.mockReturnValue(
    walletResult({
      tokens: [
        token,
        {
          ...indexedToken,
          usdValue: 0,
          price: 0,
          valuationAvailable: false,
        },
      ],
      unresolvedHoldings: [unresolved],
      valuationAvailable: false,
      isError: true,
    }),
  );
  render(<WalletSection chainId={42161} defaultExpanded />);
  expect(walletHeader().textContent).toContain("Shown value$25.00");
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByText("Other tokens (2)").closest("details")?.open).toBe(false);
  expect(screen.queryByText(/Indexed raw balance:/)).toBeNull();
  expect(mocks.setProtocolTotals).not.toHaveBeenCalled();
});

it("keeps unpriced protocol tokens in the main list without reporting a false zero value", () => {
  mocks.wallet.mockReturnValue(
    walletResult({
      tokens: [
        {
          ...token,
          usdValue: 0,
          price: 0,
          valuationAvailable: false,
        },
      ],
      totalValue: 0,
      valuationAvailable: false,
    }),
  );
  render(<WalletSection chainId={42161} defaultExpanded />);
  expect(screen.getByText("USDai")).toBeTruthy();
  expect(walletHeader().textContent).toContain("Known value—");
  expect(screen.getByText(/1 token has no current price/)).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
  expect(mocks.setProtocolTotals).not.toHaveBeenCalled();
});

it("collapses indexed tokens even when priced, and allows promoting a legitimate holding", () => {
  mocks.wallet.mockReturnValue(
    walletResult({
      tokens: [token, indexedToken],
      totalValue: 32,
    }),
  );
  render(<WalletSection chainId={42161} defaultExpanded />);
  expect(walletHeader().textContent).toContain("Shown value$25.00");
  expect(screen.getByText("NEW").closest("details")?.open).toBe(false);
  expect(mocks.setProtocolTotals).toHaveBeenLastCalledWith("Wallet", 25, 0);
  const group = openGroup("Other tokens (1)");
  openDetails("NEW", group);
  fireEvent.click(within(group).getByRole("button", { name: "Show in wallet" }));
  expect(screen.getByText("NEW").closest("details")).toBeNull();
  expect(screen.queryByText("Other tokens (1)")).toBeNull();
  expect(walletHeader().textContent).toContain("Balance$32.00");
  expect(mocks.setProtocolTotals).toHaveBeenLastCalledWith("Wallet", 32, 0);
  expect(screen.getByRole("img", { name: "Unverified token" })).toBeTruthy();
});

it("keeps unresolved holdings accessible through details and never offers transaction actions for them", () => {
  mocks.wallet.mockReturnValue(
    walletResult({
      tokens: [],
      totalValue: 0,
      unresolvedHoldings: [
        {
          ...unresolved,
          reason: "balance",
        },
      ],
      isError: true,
      valuationAvailable: false,
    }),
  );
  render(<WalletSection chainId={42161} defaultExpanded />);
  expect(screen.queryByText(/Indexed raw balance:/)).toBeNull();
  const group = openGroup("Other tokens (1)");
  expect(screen.queryByRole("button", { name: /Swap|Bridge/ })).toBeNull();
  openDetails("0x2222…2222", group);
  expect(screen.getByText(/Indexed raw balance:/).textContent).toContain("2678");
  expect(screen.getByText(/indexed amount may be out of date/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Show in wallet" })).toBeNull();
  expect(mocks.setProtocolTotals).not.toHaveBeenCalled();
});

it("excludes hidden holdings from portfolio value and restores their contribution explicitly", () => {
  render(<WalletSection chainId={42161} defaultExpanded />);
  hideToken("USDai");
  expect(screen.getByText("USDai").closest("details")?.open).toBe(false);
  expect(walletHeader().textContent).toContain("Shown value—");
  expect(mocks.setProtocolTotals).toHaveBeenLastCalledWith("Wallet", 0, 0);
  const group = openGroup("Hidden tokens (1)");
  expect(within(group).queryByRole("button", { name: /Swap|Bridge/ })).toBeNull();
  openDetails("USDai", group);
  fireEvent.click(within(group).getByRole("button", { name: "Restore USDai" }));
  expect(screen.getByText("USDai").closest("details")).toBeNull();
  expect(screen.queryByText("Hidden tokens (1)")).toBeNull();
  expect(walletHeader().textContent).toContain("Balance$25.00");
  expect(mocks.setProtocolTotals).toHaveBeenLastCalledWith("Wallet", 25, 0);
});

it("scopes hiding to the wallet and chain, retaining it only for the component session", () => {
  const { rerender, unmount } = render(<WalletSection chainId={42161} defaultExpanded />);
  hideToken("USDai");
  mocks.wallet.mockReturnValue(walletResult({ visibilityScope: "42161:wallet-two" }));
  rerender(<WalletSection chainId={42161} defaultExpanded />);
  expect(screen.getByText("USDai").closest("details")).toBeNull();
  mocks.wallet.mockReturnValue(walletResult({ visibilityScope: "1:wallet-one" }));
  rerender(<WalletSection chainId={1} defaultExpanded />);
  expect(screen.getByText("USDai").closest("details")).toBeNull();
  mocks.wallet.mockReturnValue(walletResult());
  rerender(<WalletSection chainId={42161} defaultExpanded />);
  expect(screen.getByText("Hidden tokens (1)")).toBeTruthy();
  unmount();
  render(<WalletSection chainId={42161} defaultExpanded />);
  expect(screen.getByText("USDai").closest("details")).toBeNull();
});

it("does not carry an explicit show choice into another wallet", () => {
  const result = walletResult({
    tokens: [indexedToken],
    totalValue: 7,
  });
  mocks.wallet.mockReturnValue(result);
  const { rerender } = render(<WalletSection chainId={42161} defaultExpanded />);
  const group = openGroup("Other tokens (1)");
  openDetails("NEW", group);
  fireEvent.click(within(group).getByRole("button", { name: "Show in wallet" }));
  mocks.wallet.mockReturnValue({
    ...result,
    visibilityScope: "42161:wallet-two",
  });
  rerender(<WalletSection chainId={42161} defaultExpanded />);
  expect(screen.getByText("NEW").closest("details")?.open).toBe(false);
  mocks.wallet.mockReturnValue(result);
  rerender(<WalletSection chainId={42161} defaultExpanded />);
  expect(screen.getByText("NEW").closest("details")).toBeNull();
});

it("keeps tiny positive amounts and values distinct from zero", () => {
  mocks.wallet.mockReturnValue(
    walletResult({
      tokens: [
        {
          ...token,
          balanceFormatted: 0.0000001,
          usdValue: 0.001,
        },
      ],
      totalValue: 0.001,
    }),
  );
  render(<WalletSection chainId={42161} defaultExpanded />);
  expect(walletHeader().textContent).toContain("<$0.01");
  expect(screen.getAllByText("<0.0001").length).toBeGreaterThan(0);
});

it("keeps the main holdings disclosure keyboard accessible", () => {
  render(<WalletSection chainId={42161} />);
  const toggle = walletHeader();
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
});

it("does not label failed native balance reads as an empty wallet after successful enumeration", () => {
  mocks.wallet.mockReturnValue(
    walletResult({
      tokens: [],
      totalValue: 0,
      isError: true,
      isDiscoveryIncomplete: false,
      valuationAvailable: true,
    }),
  );
  render(<WalletSection chainId={42161} defaultExpanded />);
  expect(walletHeader().textContent).toContain("Known value—");
  expect(screen.getByRole("status").textContent).toContain("Couldn't load your wallet holdings");
  expect(screen.queryByText("No tokens found in wallet")).toBeNull();
  expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  expect(mocks.setProtocolTotals).not.toHaveBeenCalled();
});

it("labels successfully loaded balances as partial when another balance read failed", () => {
  mocks.wallet.mockReturnValue(
    walletResult({
      isError: true,
      isDiscoveryIncomplete: false,
      valuationAvailable: true,
    }),
  );
  render(<WalletSection chainId={42161} defaultExpanded />);
  expect(walletHeader().textContent).toContain("Known value$25.00");
  expect(mocks.setProtocolTotals).not.toHaveBeenCalled();
});

it("does not include unverified provider prices in portfolio totals before an explicit show choice", () => {
  mocks.wallet.mockReturnValue(
    walletResult({
      tokens: [
        token,
        {
          ...indexedToken,
          usdValue: 1000000,
          price: 1000000 / 7,
        },
      ],
      totalValue: 1000025,
    }),
  );
  render(<WalletSection chainId={42161} defaultExpanded />);
  expect(walletHeader().textContent).toContain("Shown value$25.00");
  expect(mocks.setProtocolTotals).toHaveBeenLastCalledWith("Wallet", 25, 0);
});

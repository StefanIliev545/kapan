// @vitest-environment jsdom
import { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WalletSection } from "../WalletSection";
const mocks = vi.hoisted(() => {
  return {
    wallet: vi.fn(),
    refetch: vi.fn(),
    setProtocolTotals: vi.fn(),
  };
});
vi.mock("~~/hooks/useWalletTokens", () => {
  return {
    useWalletTokens: mocks.wallet,
  };
});
vi.mock("~~/services/store/store", () => {
  return {
    useGlobalState: (select: (state: { setProtocolTotals: typeof mocks.setProtocolTotals }) => unknown) => {
      return select({
        setProtocolTotals: mocks.setProtocolTotals,
      });
    },
  };
});
vi.mock("~~/hooks/common/useTxCompletedListener", () => {
  return {
    useTxCompletedListenerDelayed: () => {},
  };
});
vi.mock("next/dynamic", () => {
  return {
    default: () => {
      return function Modal() {
        return null;
      };
    },
  };
});
vi.mock("framer-motion", () => {
  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => {
      return <>{children}</>;
    },
    motion: {
      div: ({ children }: { children: ReactNode }) => {
        return <div>{children}</div>;
      },
    },
  };
});
vi.mock("~~/components/common/TokenDisplay", () => {
  return {
    TokenIcon: () => {
      return null;
    },
  };
});
vi.mock("~~/components/common/TokenSymbolDisplay", () => {
  return {
    TokenSymbolDisplay: ({ symbol }: { symbol: string }) => {
      return <span>{symbol}</span>;
    },
  };
});
vi.mock("~~/components/common/AmountDisplay", () => {
  return {
    UsdDisplay: ({ value }: { value: number }) => {
      return <span>{value}</span>;
    },
  };
});
vi.mock("~~/utils/chainFeatures", () => {
  return {
    is1inchSupported: () => {
      return false;
    },
  };
});
const token = {
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
};
function walletResult(overrides: Record<string, unknown> = {}) {
  return {
    tokens: [token],
    isLoading: false,
    isError: false,
    error: null,
    totalValue: 25,
    tokenCount: 1,
    refetch: mocks.refetch,
    unresolvedHoldings: [],
    valuationAvailable: true,
    visibilityScope: "42161:wallet-one",
    ...overrides,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.wallet.mockReturnValue(walletResult());
});
afterEach(() => {
  cleanup();
});
it.each([false, true])(
  "labels partial discovery when expanded=%s without reporting a complete portfolio total",
  (expanded) => {
    mocks.wallet.mockReturnValue(
      walletResult({
        isError: true,
        error: new Error("Discovery unavailable"),
      }),
    );
    render(<WalletSection chainId={42161} defaultExpanded={expanded} />);
    expect(screen.getByRole("alert").textContent).toContain("Wallet discovery is incomplete");
    expect(screen.getByRole("alert").textContent).toContain("may be partial");
    expect(screen.getByText("Balance (incomplete)").parentElement?.textContent).toContain("25");
    expect(screen.getByText("Tokens (incomplete)").parentElement?.textContent).toContain("1");
    expect(mocks.setProtocolTotals).not.toHaveBeenCalled();
    if (expanded) {
      expect(screen.getByText("USDai")).toBeTruthy();
    }
  },
);
it.each([false, true])(
  "shows failed empty discovery when expanded=%s instead of a successful empty wallet",
  (expanded) => {
    mocks.wallet.mockReturnValue(
      walletResult({
        tokens: [],
        totalValue: 0,
        tokenCount: 0,
        isError: true,
        error: new Error("Discovery unavailable"),
      }),
    );
    render(<WalletSection chainId={42161} defaultExpanded={expanded} />);
    expect(screen.getByRole("alert").textContent).toContain("could not be fully loaded");
    expect(screen.queryByText("No tokens found in wallet")).toBeNull();
    expect(screen.getByText("Balance (incomplete)").parentElement?.textContent).toContain("—");
    expect(screen.getByText("Tokens (incomplete)").parentElement?.textContent).toContain("—");
    expect(mocks.setProtocolTotals).not.toHaveBeenCalled();
    if (expanded) {
      expect(screen.getByText("Token list unavailable")).toBeTruthy();
    }
  },
);
it("retries the wallet hook and restores complete statistics after recovery", () => {
  mocks.wallet.mockReturnValue(
    walletResult({
      isError: true,
    }),
  );
  const { rerender } = render(<WalletSection chainId={42161} defaultExpanded />);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Retry",
    }),
  );
  expect(mocks.refetch).toHaveBeenCalledOnce();
  mocks.wallet.mockReturnValue(walletResult());
  rerender(<WalletSection chainId={42161} defaultExpanded />);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("Balance")).toBeTruthy();
  expect(screen.getByText("Tokens")).toBeTruthy();
  expect(mocks.setProtocolTotals).toHaveBeenCalledWith("Wallet", 25, 0);
});
it("keeps successful empty discovery distinct from failure", () => {
  mocks.wallet.mockReturnValue(
    walletResult({
      tokens: [],
      totalValue: 0,
      tokenCount: 0,
    }),
  );
  render(<WalletSection chainId={42161} defaultExpanded />);
  expect(screen.getByText("No tokens found in wallet")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(mocks.setProtocolTotals).toHaveBeenCalledWith("Wallet", 0, 0);
});
it("does not overwrite the last complete portfolio contribution with partial discovery", () => {
  const { rerender } = render(<WalletSection chainId={42161} />);
  expect(mocks.setProtocolTotals).toHaveBeenCalledWith("Wallet", 25, 0);
  mocks.setProtocolTotals.mockClear();
  mocks.wallet.mockReturnValue(
    walletResult({
      isError: true,
      totalValue: 5,
      tokens: [
        {
          ...token,
          usdValue: 5,
        },
      ],
    }),
  );
  rerender(<WalletSection chainId={42161} />);
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(mocks.setProtocolTotals).not.toHaveBeenCalled();
});
it("keeps an unknown unpriced holding visible and withholds a complete zero valuation", () => {
  mocks.wallet.mockReturnValue(
    walletResult({
      tokens: [
        {
          ...token,
          source: "indexed",
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
  expect(screen.getByText("Unverified")).toBeTruthy();
  expect(screen.getByText("Value unavailable")).toBeTruthy();
  expect(screen.getByText("Balance").parentElement?.textContent).toContain("—");
  expect(screen.getByText(/Wallet valuation unavailable/)).toBeTruthy();
  expect(mocks.setProtocolTotals).not.toHaveBeenCalled();
});
it("shows raw indexed balances as stale and read-only when the current RPC read fails", () => {
  mocks.wallet.mockReturnValue(
    walletResult({
      tokens: [],
      totalValue: 0,
      unresolvedHoldings: [
        {
          address: token.address,
          rawBalance: "25000000000000000000",
          reason: "balance",
        },
      ],
      isError: true,
      valuationAvailable: false,
    }),
  );
  render(<WalletSection chainId={42161} defaultExpanded />);
  expect(screen.getByRole("alert").textContent).toContain("Available tokens are shown");
  expect(screen.getByText(/Raw balance:/).textContent).toContain("indexed, stale/unverified");
  expect(screen.getByText(/Amount and value unavailable/)).toBeTruthy();
  expect(
    screen.queryByRole("button", {
      name: /Swap|Bridge/,
    }),
  ).toBeNull();
  expect(screen.queryByText("No tokens found in wallet")).toBeNull();
  expect(mocks.setProtocolTotals).not.toHaveBeenCalled();
});
it("keeps unknowns visible by default and makes hide/reveal/restore explicit without reducing portfolio totals", () => {
  render(<WalletSection chainId={42161} defaultExpanded />);
  expect(screen.getByText("USDai")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Hide USDai",
    }),
  );
  expect(screen.queryByText("USDai")).toBeNull();
  expect(screen.getByText("Displayed balance (filtered)")).toBeTruthy();
  expect(screen.getByText("Displayed tokens (filtered)").parentElement?.textContent).toContain("0");
  expect(
    screen.queryByRole("button", {
      name: "Bridge USDai",
    }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Show hidden tokens",
    }),
  );
  expect(screen.getByText(/Hidden by you/)).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", {
      name: `Restore ${token.address}`,
    }),
  );
  expect(screen.getByText("USDai")).toBeTruthy();
  expect(screen.queryByText("Displayed balance (filtered)")).toBeNull();
  expect(
    mocks.setProtocolTotals.mock.calls.every((call) => {
      return call[1] === 25;
    }),
  ).toBe(true);
});
it("scopes user filtering to account and chain and remembers it only for this component session", () => {
  const { rerender, unmount } = render(<WalletSection chainId={42161} defaultExpanded />);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Hide USDai",
    }),
  );
  mocks.wallet.mockReturnValue(
    walletResult({
      visibilityScope: "42161:wallet-two",
    }),
  );
  rerender(<WalletSection chainId={42161} defaultExpanded />);
  expect(screen.getByText("USDai")).toBeTruthy();
  mocks.wallet.mockReturnValue(
    walletResult({
      visibilityScope: "1:wallet-one",
    }),
  );
  rerender(<WalletSection chainId={1} defaultExpanded />);
  expect(screen.getByText("USDai")).toBeTruthy();
  mocks.wallet.mockReturnValue(walletResult());
  rerender(<WalletSection chainId={42161} defaultExpanded />);
  expect(screen.queryByText("USDai")).toBeNull();
  unmount();
  render(<WalletSection chainId={42161} defaultExpanded />);
  expect(screen.getByText("USDai")).toBeTruthy();
});
it("allows hiding and restoring unresolved rows without offering modal actions", () => {
  mocks.wallet.mockReturnValue(
    walletResult({
      tokens: [],
      unresolvedHoldings: [
        {
          address: token.address,
          rawBalance: "25",
          reason: "decimals",
        },
      ],
      isError: true,
      valuationAvailable: false,
    }),
  );
  render(<WalletSection chainId={42161} defaultExpanded />);
  fireEvent.click(
    screen.getByRole("button", {
      name: `Hide ${token.address}`,
    }),
  );
  expect(screen.queryByText(/Raw balance:/)).toBeNull();
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Show hidden tokens",
    }),
  );
  expect(
    screen.queryByRole("button", {
      name: /Swap|Bridge/,
    }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", {
      name: `Restore ${token.address}`,
    }),
  );
  expect(screen.getByText(/Raw balance:/)).toBeTruthy();
});
it("uses a native button with an expanded state for the holdings disclosure", () => {
  render(<WalletSection chainId={42161} />);
  const toggle = screen.getByRole("button", {
    name: "Toggle wallet holdings",
  });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
});

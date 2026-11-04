// @vitest-environment jsdom
import { type PropsWithChildren, StrictMode, useEffect } from "react";
import App from "../page";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSetProtocolTotals } from "~~/contexts/DashboardTotalsContext";

const state = vi.hoisted(() => ({
  evmAddress: "0xabc" as string | undefined,
  starknetAddress: undefined as string | undefined,
  starknetChainId: 1n,
  evmChainId: 8453,
  switchChain: vi.fn(),
  realFilter: false,
  ready: true,
  supply: 100,
  borrow: 25,
  publish: undefined as ((protocol: string, supply: number, borrow: number) => void) | undefined,
  renderedSupply: [] as number[],
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: state.evmAddress,
    chain: { id: state.evmChainId },
  }),
  useSwitchChain: () => ({ switchChain: state.switchChain }),
}));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("~~/hooks/useAccount", () => ({
  useAccount: () => ({
    viewingAddress: state.starknetAddress,
    chainId: state.starknetChainId,
  }),
}));

vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<unknown>) => {
    const source = String(loader);
    const contributes = source.includes("MorphoProtocolView") || source.includes("VesuProtocolView");
    if (!contributes) {
      return () => null;
    }

    return function CachedProtocol() {
      const publish = useSetProtocolTotals();
      const { ready, supply, borrow } = state;
      state.publish = publish;
      useEffect(() => {
        if (ready) {
          publish("Protocol", supply, borrow);
        }
      }, [publish, ready, supply, borrow]);
      return null;
    };
  },
}));

vi.mock("~~/components/layouts/DashboardLayout", () => ({
  DashboardLayout: ({ children }: PropsWithChildren) => children,
}));
vi.mock("~~/components/common/StableArea", () => ({
  default: ({ children }: PropsWithChildren) => children,
}));
vi.mock("~~/components/common/SupportBanner", () => ({ SupportBanner: () => null }));
vi.mock("~~/components/common/ProtocolSkeleton", () => ({ ProtocolSkeleton: () => null }));
vi.mock("~~/components/NetworkFilter", async importOriginal => {
  const actual = await importOriginal<typeof import("~~/components/NetworkFilter")>();
  return {
    NetworkFilter: (props: React.ComponentProps<typeof actual.NetworkFilter>) => {
      if (state.realFilter) {
        return <actual.NetworkFilter {...props} />;
      }

      return (
        <>
          {["base", "arbitrum", "starknet"].map(network => (
            <button key={network} onClick={() => props.onNetworkChange(network)}>
              {network}
            </button>
          ))}
        </>
      );
    },
  };
});
vi.mock("~~/components/dashboard/DashboardMetrics", () => ({
  DashboardMetrics: ({
    totalSupply,
    totalDebt,
    isLoading,
  }: {
    totalSupply: number;
    totalDebt: number;
    isLoading: boolean;
  }) => {
    state.renderedSupply.push(totalSupply);
    return <output data-testid="totals">{`${totalSupply}:${totalDebt}:${isLoading}`}</output>;
  },
}));

function dashboard() {
  return (
    <StrictMode>
      <App />
    </StrictMode>
  );
}

function expectTotals(supply: number, borrow: number, loading = false) {
  for (const output of screen.getAllByTestId("totals")) {
    expect(output.textContent).toBe(`${supply}:${borrow}:${loading}`);
  }
}

beforeEach(() => {
  state.evmAddress = "0xabc";
  state.starknetAddress = undefined;
  state.starknetChainId = 1n;
  state.evmChainId = 8453;
  state.realFilter = false;
  state.switchChain.mockClear();
  localStorage.clear();
  window.history.replaceState(null, "", "/app");
  state.ready = true;
  state.supply = 100;
  state.borrow = 25;
  state.publish = undefined;
  state.renderedSupply = [];
});
afterEach(cleanup);

it("keeps cached child contributions on first mount and remount", () => {
  const first = render(dashboard());
  expectTotals(100, 25);
  first.unmount();
  render(dashboard());
  expectTotals(100, 25);
});

it("does not reset the active EVM portfolio when a Starknet wallet connects", () => {
  const { rerender } = render(dashboard());
  const publisher = state.publish;
  state.starknetAddress = "0xdef";
  state.renderedSupply = [];
  rerender(dashboard());
  expectTotals(100, 25);
  expect(state.publish).toBe(publisher);
  expect(state.renderedSupply).not.toContain(0);
});

it("disconnect clears the portfolio even if a child still has old cached balances", () => {
  const { rerender } = render(dashboard());
  const oldPublisher = state.publish!;
  state.evmAddress = undefined;
  state.renderedSupply = [];
  rerender(dashboard());
  act(() => oldPublisher("Protocol", 999, 9));
  expectTotals(0, 0);
  expect(state.renderedSupply.every(value => value === 0)).toBe(true);
});

it("account switches start empty and ignore late publications from the old scope", () => {
  const { rerender } = render(dashboard());
  const oldPublisher = state.publish!;
  state.evmAddress = "0xdef";
  state.ready = false;
  state.renderedSupply = [];
  rerender(dashboard());
  act(() => oldPublisher("Protocol", 999, 9));
  expectTotals(0, 0, true);
  expect(state.renderedSupply.every(value => value === 0)).toBe(true);

  state.ready = true;
  state.supply = 50;
  state.borrow = 10;
  rerender(dashboard());
  expectTotals(50, 10);
});

it("network switches and returning to cached data use independent totals", () => {
  render(dashboard());
  const oldPublisher = state.publish!;
  state.ready = false;
  fireEvent.click(screen.getByRole("button", { name: "arbitrum" }));
  act(() => oldPublisher("Protocol", 999, 9));
  expectTotals(0, 0, true);

  state.ready = true;
  fireEvent.click(screen.getByRole("button", { name: "base" }));
  expectTotals(100, 25);
});

it("normalizes account casing without discarding the active scope", () => {
  const { rerender } = render(dashboard());
  const publisher = state.publish;
  state.evmAddress = "0xABC";
  rerender(dashboard());
  expectTotals(100, 25);
  expect(state.publish).toBe(publisher);
});

it("keeps the real network filter's pending wallet switch across portfolio scopes", () => {
  state.realFilter = true;
  const { rerender } = render(dashboard());
  fireEvent.click(screen.getByRole("button", { name: "Arbitrum", pressed: false }));

  expect(state.switchChain).toHaveBeenCalledWith({ chainId: 42161 });
  expect(screen.getByRole("button", { name: "Arbitrum", pressed: true })).toBeTruthy();
  expect(new URLSearchParams(window.location.search).get("network")).toBe("arbitrum");

  state.evmChainId = 42161;
  rerender(dashboard());
  expect(screen.getByRole("button", { name: "Arbitrum", pressed: true })).toBeTruthy();
  expectTotals(100, 25);
});

it("scopes Starknet totals to its viewing wallet and chain, not the EVM wallet", () => {
  state.starknetAddress = "0xdef";
  const { rerender } = render(dashboard());
  fireEvent.click(screen.getByRole("button", { name: "starknet" }));
  const publisher = state.publish;
  state.evmAddress = undefined;
  rerender(dashboard());
  expectTotals(100, 25);
  expect(state.publish).toBe(publisher);

  state.starknetChainId = 2n;
  state.ready = false;
  rerender(dashboard());
  expectTotals(0, 0, true);

  state.starknetAddress = undefined;
  rerender(dashboard());
  expectTotals(0, 0);
});

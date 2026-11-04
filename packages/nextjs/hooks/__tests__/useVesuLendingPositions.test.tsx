import { createElement, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVesuLendingPositions } from "../useVesuLendingPositions";
import { useVesuV2LendingPositions } from "../useVesuV2LendingPositions";
import type { AssetWithRates } from "../useVesuAssets";
import { toHexAddress, type PositionTuple } from "../useProtocolPositions/utils";

const mocks = vi.hoisted(() => ({
  chain: "mainnet",
  read: vi.fn(),
}));

vi.mock("~~/contracts/externalContracts", () => ({ tokenNameToLogo: () => "" }));
vi.mock("~~/hooks/scaffold-stark", () => ({
  // Exercise query ownership and notifications with a real QueryClient; the
  // contract transport is the only mocked part of the position data lifecycle.
  useScaffoldReadContract: ({ contractName, args }: { contractName: string; args: unknown[] }) => {
    const queryKey = ["vesu-test", mocks.chain, contractName, ...args.map(String)];
    return useQuery({
      queryKey,
      queryFn: () => mocks.read(queryKey),
      enabled: args[0] !== undefined,
      staleTime: Infinity,
    });
  },
}));

const asset = (address: bigint, symbol: bigint): AssetWithRates => ({
  address,
  symbol,
  decimals: 0,
  price: { value: 10n ** 18n, is_valid: true },
  rate_accumulator: 0n,
  utilization: 0n,
  fee_rate: 0n,
  total_nominal_debt: 0n,
  last_rate_accumulator: 0n,
  reserve: 0n,
  scale: 1n,
  supplyAPY: 0.02,
  borrowAPR: 0.04,
});
const assets = [asset(1n, 0x455448n), asset(2n, 0x55534443n)];
const assetData = {
  assetsWithRates: assets,
  assetMap: new Map(assets.map(item => [toHexAddress(item.address), item])),
  collateralSet: new Set([toHexAddress(1n)]),
  debtSet: new Set([toHexAddress(2n)]),
  isLoading: false,
  assetsError: undefined,
};
vi.mock("~~/hooks/useVesuAssets", () => ({ useVesuAssets: () => assetData }));
vi.mock("~~/hooks/useVesuV2Assets", () => ({ useVesuV2Assets: () => assetData }));

const position = (collateral: bigint, debt = 25n): PositionTuple => [
  1n,
  2n,
  { collateral_shares: collateral, collateral_amount: collateral, nominal_debt: debt, is_vtoken: false },
];
const pending = () => new Promise<PositionTuple[]>(() => {});
const clients: QueryClient[] = [];

beforeEach(() => {
  mocks.chain = "mainnet";
  mocks.read.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach(client => client.clear());
  vi.restoreAllMocks();
});

describe.each([
  { version: "V1", contract: "VesuGateway", pool: "10", nextPool: "11", hook: useVesuLendingPositions, poolArgument: BigInt },
  { version: "V2", contract: "VesuGatewayV2", pool: "0x10", nextPool: "0x11", hook: useVesuV2LendingPositions, poolArgument: String },
])("Vesu $version query-backed positions", ({ contract, pool, nextPool, hook, poolArgument }) => {
  const pageKey = (page = 0, address = "0xabc", selectedPool = pool, chain = "mainnet") =>
    ["vesu-test", chain, contract, address, selectedPool, String(page * 2), String(page * 2 + 2)];

  const setup = (initialPositions: PositionTuple[] | undefined = [position(100n)], complete = true) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    clients.push(client);
    if (initialPositions !== undefined) {
      client.setQueryData(pageKey(), initialPositions);
    }
    if (complete) {
      for (let page = 1; page < 5; page += 1) {
        client.setQueryData(pageKey(page), []);
      }
    }
    mocks.read.mockImplementation(key => client.getQueryData(key) ?? pending());
    const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
    const rendered = renderHook(
      ({ address, selectedPool }: { address?: string; selectedPool: string }) =>
        // The parameterized hooks differ only in the pool's string/bigint type.
        (hook as (address: string | undefined, pool: string | bigint) => ReturnType<typeof useVesuLendingPositions>)(
          address,
          poolArgument(selectedPool),
        ),
      { wrapper, initialProps: { address: "0xabc" as string | undefined, selectedPool: pool } },
    );
    return { client, ...rendered };
  };

  it("marks five successful empty pages loaded", async () => {
    const { result } = setup([]);
    await waitFor(() => expect(result.current.hasLoadedOnce).toBe(true));
    expect(result.current.rows).toEqual([]);
    expect(result.current.isLoadingPositions).toBe(false);
  });

  it("renders cache updates immediately without a second unrelated render", async () => {
    const { client, result } = setup();
    await waitFor(() => expect(result.current.rows[0]?.supply.balance).toBe(100));
    await waitFor(() => expect(result.current.isUpdating).toBe(false));
    act(() => {
      client.setQueryData(pageKey(), [position(200n, 50n)]);
    });
    await waitFor(() => expect(result.current.rows[0]?.supply.balance).toBe(200));
    expect(result.current.rows[0].borrow?.balance).toBe(-50);
    expect(result.current.rows[0].ltvPercent).toBe(25);
  });

  it("removes the last position when its page becomes successfully empty", async () => {
    const { client, result } = setup();
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    await waitFor(() => expect(result.current.isUpdating).toBe(false));
    act(() => {
      client.setQueryData(pageKey(), []);
    });
    await waitFor(() => expect(result.current.rows).toEqual([]));
    expect(result.current.hasLoadedOnce).toBe(true);
  });

  it("does not treat partial pages or a failed initial page as a complete load", async () => {
    const { client, result } = setup([position(100n)], false);
    expect(result.current.hasLoadedOnce).toBe(false);
    expect(result.current.isLoadingPositions).toBe(true);
    const failure = new Error("page unavailable");
    mocks.read.mockRejectedValue(failure);
    await act(async () => {
      await client.cancelQueries();
      await client.refetchQueries({ queryKey: pageKey(1), exact: true });
    });
    await waitFor(() => expect(result.current.positionsError).toBe(failure));
    expect(result.current.hasLoadedOnce).toBe(false);
  });

  it("keeps scoped data during refresh and accepts the new result", async () => {
    const { client, result } = setup();
    await waitFor(() => expect(result.current.isUpdating).toBe(false));
    let resolve!: (positions: PositionTuple[]) => void;
    mocks.read.mockImplementationOnce(() => new Promise<PositionTuple[]>(done => { resolve = done; }));
    act(() => {
      void client.refetchQueries({ queryKey: pageKey(), exact: true });
    });
    await waitFor(() => expect(result.current.isUpdating).toBe(true));
    expect(result.current.rows[0].supply.balance).toBe(100);
    expect(result.current.hasLoadedOnce).toBe(true);
    await act(async () => { resolve([position(150n)]); });
    await waitFor(() => expect(result.current.rows[0]?.supply.balance).toBe(150));
    expect(result.current.isUpdating).toBe(false);
  });

  it("retains available data after a failed background refresh", async () => {
    const { client, result } = setup();
    await waitFor(() => expect(result.current.isUpdating).toBe(false));
    const failure = new Error("refresh unavailable");
    mocks.read.mockRejectedValueOnce(failure);
    await act(async () => {
      await client.refetchQueries({ queryKey: pageKey(), exact: true });
    });
    await waitFor(() => expect(result.current.positionsError).toBe(failure));
    expect(result.current.hasLoadedOnce).toBe(true);
    expect(result.current.rows[0].supply.balance).toBe(100);
    expect(result.current.isUpdating).toBe(false);
  });

  it.each(["account", "pool", "chain"])("clears old data on %s changes and ignores late previous-scope updates", async scope => {
    const { client, result, rerender } = setup();
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    if (scope === "chain") {
      mocks.chain = "sepolia";
    }
    rerender({ address: scope === "account" ? "0xdef" : "0xabc", selectedPool: scope === "pool" ? nextPool : pool });
    expect(result.current.rows).toEqual([]);
    expect(result.current.hasLoadedOnce).toBe(false);
    act(() => {
      client.setQueryData(pageKey(), [position(999n)]);
    });
    expect(result.current.rows).toEqual([]);
    expect(result.current.hasLoadedOnce).toBe(false);
  });

  it("clears positions and loading state on disconnect", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    rerender({ address: undefined, selectedPool: pool });
    expect(result.current.rows).toEqual([]);
    expect(result.current.hasLoadedOnce).toBe(false);
    expect(result.current.isLoadingPositions).toBe(false);
    expect(result.current.isUpdating).toBe(false);
  });
});

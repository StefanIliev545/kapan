import { createElement, type PropsWithChildren } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScaffoldReadContract } from "../useScaffoldReadContract";

const mocks = vi.hoisted(() => ({
  block: 1n as bigint | undefined,
  chain: { id: 1n, name: "Mainnet" },
  deployed: { address: "0x123", abi: [{ name: "symbol" }] } as { address: string; abi: unknown[] } | undefined,
  read: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("~~/hooks/scaffold-stark", () => ({
  useDeployedContractInfo: () => ({ data: mocks.deployed }),
}));
vi.mock("../useBlockNumberContext", () => ({ useStarkBlockNumber: () => mocks.block }));
vi.mock("@starknet-react/core", async () => {
  const { useQuery } = await import("@tanstack/react-query");
  return {
    useNetwork: () => ({ chain: mocks.chain }),
    // Match the installed SDK's top-level option forwarding and key shape.
    // Its `query` property is not unpacked, which is the regression under test.
    useReadContract: (options: Record<string, any>) => {
      mocks.read(options);
      const query = useQuery({
        ...options,
        queryKey: [{ entity: "readContract", chainId: mocks.chain.name,
          contract: options.address, functionName: options.functionName,
          args: JSON.stringify(options.args), blockIdentifier: options.blockIdentifier }],
        queryFn: () => mocks.fetch(),
      });
      // The SDK eagerly reads its result fields, subscribing to fetch/error
      // changes as well as data changes. Match that observer behavior here.
      return { ...query };
    },
  };
});

const clients: QueryClient[] = [];
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
}
const config = { contractName: "Eth", functionName: "symbol", args: ["0xAlice"], watch: true } as const;
const read = (options: Record<string, unknown> = {}) => useScaffoldReadContract({ ...config, ...options } as any);
const captured = () => mocks.read.mock.calls.at(-1)![0];
const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>(done => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  mocks.block = 1n;
  mocks.chain = { id: 1n, name: "Mainnet" };
  mocks.deployed = { address: "0x123", abi: [{ name: "symbol" }] };
  mocks.read.mockClear();
  mocks.fetch.mockReset().mockResolvedValue([10]);
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe("useScaffoldReadContract", () => {
  it("forwards partial nested overrides at the SDK's top level without losing defaults", async () => {
    const hook = renderHook(() => read({ refetchOnReconnect: false, query: {
      staleTime: 123, retry: false, meta: { source: "test" },
    } }), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.data).toEqual([10]));
    expect(captured()).toMatchObject({ staleTime: 123, gcTime: 900000,
      refetchOnWindowFocus: false, refetchOnReconnect: false, retry: false,
      enabled: true, watch: false, blockIdentifier: "latest", meta: { source: "test" } });
    expect(captured()).not.toHaveProperty("query");
  });

  it.each([
    ["top-level disabled", { enabled: false }],
    ["nested disabled", { query: { enabled: false } }],
    ["missing argument", { args: [undefined], query: { enabled: true } }],
    ["missing nested argument", { args: [["0x1", undefined]], enabled: true }],
  ])("does not fetch when %s", (_, options) => {
    renderHook(() => read(options), { wrapper: wrapper() });
    expect(captured().enabled).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("disables missing contracts but enables no-argument functions", async () => {
    mocks.deployed = undefined;
    const hook = renderHook(() => read({ args: undefined, watch: false }), { wrapper: wrapper() });
    expect(captured().enabled).toBe(false);
    mocks.deployed = { address: "0x123", abi: [{ name: "symbol" }] };
    hook.rerender();
    await waitFor(() => expect(hook.result.current.data).toEqual([10]));
    expect(captured()).toMatchObject({ enabled: true, args: [], blockIdentifier: "latest" });
  });

  it("retains settled data while the next block is pending, then shows the new result", async () => {
    const next = deferred();
    mocks.fetch.mockResolvedValueOnce([10]).mockReturnValueOnce(next.promise);
    const hook = renderHook(() => read(), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.data).toEqual([10]));
    mocks.block = 2n;
    hook.rerender();
    expect(hook.result.current.data).toEqual([10]);
    expect(hook.result.current.isLoading).toBe(false);
    await waitFor(() => expect(hook.result.current.isFetching).toBe(true));
    await act(async () => next.resolve([20]));
    await waitFor(() => expect(hook.result.current.data).toEqual([20]));
  });

  it("keeps successful data after a watched refresh fails, without changing the query key", async () => {
    const failure = new Error("RPC unavailable");
    mocks.fetch.mockResolvedValueOnce([10]).mockRejectedValueOnce(failure);
    const hook = renderHook(() => read(), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.data).toEqual([10]));
    hook.rerender();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    mocks.block = 2n;
    hook.rerender();
    await waitFor(() => expect(hook.result.current.error).toBe(failure));
    expect(hook.result.current.data).toEqual([10]);
    expect(hook.result.current.isLoading).toBe(false);
    expect(clients.at(-1)!.getQueryCache().getAll()).toHaveLength(1);
  });

  it("does not cancel or duplicate an in-flight read when another block arrives", async () => {
    const next = deferred();
    mocks.fetch.mockResolvedValueOnce([10]).mockReturnValue(next.promise);
    const hook = renderHook(() => read(), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.data).toEqual([10]));
    mocks.block = 2n;
    hook.rerender();
    await waitFor(() => expect(hook.result.current.isFetching).toBe(true));
    mocks.block = 3n;
    hook.rerender();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await act(async () => next.resolve([20]));
    await waitFor(() => expect(hook.result.current.data).toEqual([20]));
  });

  it("preserves explicit historical block identifiers and does not refresh unwatched reads", async () => {
    const hook = renderHook(() => read({ watch: false, blockIdentifier: 42 }), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.data).toEqual([10]));
    mocks.block = 2n;
    hook.rerender();
    expect(captured().blockIdentifier).toBe(42);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["account", "chain", "contract", "function", "pool", "disconnect"])(
    "does not reuse data across a %s change", async boundary => {
      const next = deferred();
      mocks.fetch.mockResolvedValueOnce([10]).mockReturnValue(next.promise);
      let options: Record<string, unknown> = {};
      const hook = renderHook(() => read(options), { wrapper: wrapper() });
      await waitFor(() => expect(hook.result.current.data).toEqual([10]));
      if (boundary === "account") {
        options = { args: ["0xBob"] };
      }
      if (boundary === "chain") {
        mocks.chain = { id: 2n, name: "Sepolia" };
      }
      if (boundary === "contract") {
        mocks.deployed = { address: "0x456", abi: [{ name: "symbol" }] };
      }
      if (boundary === "function") {
        options = { functionName: "balance_of" };
      }
      if (boundary === "pool") {
        options = { args: ["0xAlice", 2n] };
      }
      if (boundary === "disconnect") {
        options = { args: [undefined] };
      }
      hook.rerender();
      expect(hook.result.current.data).toBeUndefined();
      await act(async () => next.resolve([20]));
    },
  );

  it("preserves a custom placeholder callback only within its original identity", async () => {
    const next = deferred();
    const placeholder = vi.fn((previous: unknown) => previous);
    mocks.fetch.mockResolvedValueOnce([10]).mockReturnValue(next.promise);
    let account = "0xAlice";
    let atBlock = 1;
    const hook = renderHook(() => read({ args: [account], watch: false, blockIdentifier: atBlock,
      query: { placeholderData: placeholder } }), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.data).toEqual([10]));
    atBlock = 2;
    hook.rerender();
    expect(hook.result.current.data).toEqual([10]);
    expect(placeholder).toHaveBeenCalled();
    placeholder.mockClear();
    account = "0xBob";
    hook.rerender();
    expect(hook.result.current.data).toBeUndefined();
    expect(placeholder).not.toHaveBeenCalled();
    await act(async () => next.resolve([20]));
  });
});

// @vitest-environment jsdom
import { createElement, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMorphoLendingPositions } from "../useMorphoLendingPositions";
import { qk } from "~~/lib/queryKeys";
vi.mock("~~/contracts/externalContracts", () => ({ tokenNameToLogo: () => "" }));
vi.mock("~~/utils/morpho/marketApi", () => ({ fetchMorphoMarkets: () => Promise.resolve([]) }));
vi.mock("~~/utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const fetchMock = vi.fn();
const address = "0x0000000000000000000000000000000000000000";
const clients: QueryClient[] = [];
const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  return {
    client,
    wrapper,
  };
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  clients.splice(0).forEach(client => client.clear());
  vi.unstubAllGlobals();
});

describe("Morpho position retrieval errors", () => {
  it.each(["http", "transport", "shape"])("exposes %s errors through React Query", async failure => {
    if (failure === "transport") {
      fetchMock.mockRejectedValue(new Error("network unavailable"));
    } else {
      fetchMock.mockResolvedValue(failure === "http" ? Response.json({}, { status: 502 }) : Response.json({}));
    }
    const { wrapper } = setup();
    const { result } = renderHook(() => useMorphoLendingPositions(8453, address), { wrapper });
    await waitFor(() => expect(result.current.positionsError).toBeInstanceOf(Error));
    expect(result.current.rows).toEqual([]);
    expect(result.current.hasLoadedOnce).toBe(false);
  });
  it("does not mark a failed initial request or its pending retry as loaded", async () => {
    let finishRetry!: (response: Response) => void;
    fetchMock.mockResolvedValueOnce(Response.json({}, { status: 502 })).mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          finishRetry = resolve;
        }),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useMorphoLendingPositions(8453, address), { wrapper });

    await waitFor(() => expect(result.current.positionsError).toBeInstanceOf(Error));
    expect(result.current.hasLoadedOnce).toBe(false);

    act(() => {
      void result.current.refetchPositions();
    });
    await waitFor(() => expect(result.current.isLoadingPositions).toBe(true));
    expect(result.current.positionsError).toBeNull();
    expect(result.current.hasLoadedOnce).toBe(false);

    await act(async () => {
      finishRetry(Response.json({ userByAddress: { marketPositions: [] } }));
    });
    await waitFor(() => expect(result.current.hasLoadedOnce).toBe(true));
    expect(result.current.isLoadingPositions).toBe(false);
    expect(result.current.positionsError).toBeNull();
    expect(result.current.rows).toEqual([]);
  });

  it.each(["wallet", "chain"])("does not carry loaded state into a different %s query", async changed => {
    let finishNewQuery!: (response: Response) => void;
    fetchMock.mockResolvedValueOnce(Response.json({ userByAddress: { marketPositions: [] } })).mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          finishNewQuery = resolve;
        }),
    );
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ chainId, userAddress }) => useMorphoLendingPositions(chainId, userAddress),
      {
        wrapper,
        initialProps: {
          chainId: 8453,
          userAddress: address,
        },
      },
    );
    await waitFor(() => expect(result.current.hasLoadedOnce).toBe(true));

    rerender({
      chainId: changed === "chain" ? 42161 : 8453,
      userAddress: changed === "wallet" ? "0x0000000000000000000000000000000000000001" : address,
    });
    expect(result.current.hasLoadedOnce).toBe(false);
    expect(result.current.isLoadingPositions).toBe(true);

    await act(async () => {
      finishNewQuery(Response.json({ userByAddress: { marketPositions: [] } }));
    });
    await waitFor(() => expect(result.current.hasLoadedOnce).toBe(true));
    expect(result.current.positionsError).toBeNull();
  });
  it("treats a successful empty account as empty without an error", async () => {
    fetchMock.mockResolvedValue(Response.json({ userByAddress: { marketPositions: [] } }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useMorphoLendingPositions(8453, address), { wrapper });
    await waitFor(() => expect(result.current.isLoadingPositions).toBe(false));
    expect(result.current.positionsError).toBeNull();
    expect(result.current.rows).toEqual([]);
  });
  it("retains previous rows when a refresh fails", async () => {
    const { client, wrapper } = setup();
    const marketId = `0x${"ab".repeat(32)}`;
    client.setQueryData(qk.morpho.positions(8453, address), [
      {
        market: {
          uniqueKey: marketId,
          collateralAsset: {
            address,
            symbol: "COL",
            decimals: 18,
            priceUsd: 2,
          },
          loanAsset: {
            address,
            symbol: "USD",
            decimals: 6,
            priceUsd: 1,
          },
          oracle: { address },
          irmAddress: address,
          lltv: "860000000000000000",
          state: {
            supplyApy: 0,
            borrowApy: 0.02,
            utilization: 0.1,
          },
        },
        supplyShares: "0",
        supplyAssets: 0,
        borrowShares: "1",
        borrowAssets: 1000000,
        collateral: 2e18,
        healthFactor: 2,
      },
    ]);
    fetchMock.mockResolvedValue(Response.json({}, { status: 502 }));
    const { result } = renderHook(() => useMorphoLendingPositions(8453, address), { wrapper });
    expect(result.current.rows).toHaveLength(1);
    await act(async () => {
      await result.current.refetchPositions();
    });
    await waitFor(() => expect(result.current.positionsError).toBeInstanceOf(Error));
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].borrowBalance).toBe(1000000n);
    expect(result.current.hasLoadedOnce).toBe(true);
  });
});

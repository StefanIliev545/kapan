// @vitest-environment jsdom
import { createElement, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fetchMorphoMarkets, useMorphoMarketsQuery } from "../marketApi";
import { qk } from "~~/lib/queryKeys";

vi.mock("~~/hooks/useMorphoLendingPositions", () => ({
  sortMarketsByLiquidityDesc: (items: unknown[]) => items,
}));

const fetchMock = vi.fn();
const clients: QueryClient[] = [];

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  clients.splice(0).forEach(client => client.clear());
  vi.unstubAllGlobals();
});

it.each(["http", "transport", "shape", "json"])("exposes market %s failures through React Query", async failure => {
  if (failure === "transport") {
    fetchMock.mockRejectedValue(new Error("Network unavailable"));
  } else if (failure === "http") {
    fetchMock.mockResolvedValue(Response.json({}, { status: 502 }));
  } else if (failure === "json") {
    fetchMock.mockResolvedValue(new Response("invalid json"));
  } else {
    fetchMock.mockResolvedValue(Response.json({ markets: {} }));
  }

  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  clients.push(client);
  const wrapper = ({ children }: PropsWithChildren) => {
    return createElement(QueryClientProvider, { client }, children);
  };
  const { result } = renderHook(() => useMorphoMarketsQuery(8453), { wrapper });
  await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
});

it("accepts a successful empty market response", async () => {
  fetchMock.mockResolvedValue(Response.json({ markets: { items: [] } }));
  await expect(fetchMorphoMarkets(8453)).resolves.toEqual([]);
});

it("retains cached markets when a refetch fails", async () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  clients.push(client);
  const previous = [{ uniqueKey: "existing-market" }];
  client.setQueryData(qk.morpho.markets(8453), previous);
  fetchMock.mockResolvedValue(Response.json({}, { status: 502 }));
  const wrapper = ({ children }: PropsWithChildren) => {
    return createElement(QueryClientProvider, { client }, children);
  };
  const { result } = renderHook(() => useMorphoMarketsQuery(8453), { wrapper });

  expect(result.current.data).toEqual(previous);
  expect(result.current.error).toBeNull();

  await act(async () => {
    await result.current.refetch();
  });
  await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
  expect(result.current.data).toEqual(previous);
});

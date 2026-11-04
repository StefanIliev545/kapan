import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVesuAssets } from "../useVesuAssets";
import { useVesuV2Assets } from "../useVesuV2Assets";

const mocks = vi.hoisted(() => ({
  refetchAssets: vi.fn(),
  refetchCollaterals: vi.fn(),
  refetchDebts: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("~~/hooks/common", () => ({ useLogError: () => {} }));
vi.mock("~~/hooks/scaffold-stark", () => ({
  useScaffoldReadContract: ({ functionName }: { functionName: string }) => ({
    data: [],
    error: undefined,
    refetch: functionName === "get_supported_assets_ui"
      ? mocks.refetchAssets
      : functionName === "get_supported_collateral_assets"
        ? mocks.refetchCollaterals
        : mocks.refetchDebts,
  }),
}));

beforeEach(() => {
  mocks.refetchAssets.mockReset();
  mocks.refetchCollaterals.mockReset();
  mocks.refetchDebts.mockReset();
  mocks.fetch.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Vesu asset retries", () => {
  it("retries V1 metadata and both asset allowlists", () => {
    const { result } = renderHook(() => useVesuAssets(1n));
    act(() => { result.current.refetchAssets(); });
    expect(mocks.refetchAssets).toHaveBeenCalledOnce();
    expect(mocks.refetchCollaterals).toHaveBeenCalledOnce();
    expect(mocks.refetchDebts).toHaveBeenCalledOnce();
  });

  it("retries V2 metadata and recovers a failed rates request", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("rates unavailable"));
    mocks.fetch.mockResolvedValueOnce(Response.json({ data: { assets: [] } }));
    const { result } = renderHook(() => useVesuV2Assets("0x1"));
    await waitFor(() => expect(result.current.assetsError).toBeInstanceOf(Error));
    act(() => { result.current.refetchAssets(); });
    await waitFor(() => expect(result.current.assetsError).toBeNull());
    expect(result.current.isLoading).toBe(false);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.refetchAssets).toHaveBeenCalledOnce();
    expect(mocks.refetchCollaterals).toHaveBeenCalledOnce();
    expect(mocks.refetchDebts).toHaveBeenCalledOnce();
  });
});

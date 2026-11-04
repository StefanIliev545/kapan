// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "../route";
const mocks = vi.hoisted(() => {
  return {
    scan: vi.fn(),
  };
});
vi.mock("~~/scaffold.config", () => {
  return {
    default: {
      alchemyApiKey: "server-fixture-key",
    },
  };
});
vi.mock("~~/utils/wallet/holdings.server", () => {
  return {
    scanHoldings: mocks.scan,
  };
});
const owner = "0x0000000000000000000000000000000000000010";
function request(query = `chainId=42161&owner=${owner}`) {
  return new NextRequest(`http://localhost/api/wallet/holdings?${query}`);
}
beforeEach(() => {
  mocks.scan.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});
it.each([
  "",
  "chainId=42161",
  `owner=${owner}`,
  `owner=${owner}&chainId=0`,
  `owner=${owner}&chainId=1.5`,
  `owner=${owner}&chainId=9007199254740992`,
  "owner=bad&chainId=1",
])("rejects malformed query %s before upstream calls", async (query) => {
  const response = await GET(request(query));
  expect(response.status).toBe(400);
  expect(mocks.scan).not.toHaveBeenCalled();
});
it("injects configured server credentials and returns an uncacheable scan envelope", async () => {
  const scan = {
    chainId: 42161,
    owner,
    holdings: [],
    enumerationComplete: true,
    issues: [],
  };
  mocks.scan.mockResolvedValue(scan);
  const response = await GET(request());
  expect(mocks.scan).toHaveBeenCalledWith(42161, owner, "server-fixture-key", expect.any(AbortSignal));
  expect(await response.json()).toEqual(scan);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("preserves explicit unsupported-chain coverage without implying an empty complete scan", async () => {
  mocks.scan.mockResolvedValue({
    chainId: 9745,
    owner,
    holdings: [],
    enumerationComplete: false,
    issues: [
      {
        kind: "enumeration",
        code: "unsupported",
      },
    ],
  });
  const response = await GET(request(`chainId=9745&owner=${owner}`));
  expect((await response.json()).enumerationComplete).toBe(false);
});
it("sanitizes thrown provider details and credentials", async () => {
  mocks.scan.mockRejectedValue(new Error("https://provider/server-fixture-key"));
  const response = await GET(request());
  const body = await response.json();
  expect(body).toMatchObject({
    enumerationComplete: false,
    issues: [
      {
        kind: "enumeration",
        code: "unavailable",
      },
    ],
  });
  expect(JSON.stringify(body)).not.toMatch(/server-fixture-key|https:/);
});
it("propagates request cancellation", async () => {
  const controller = new AbortController();
  const req = new NextRequest(`http://localhost/api/wallet/holdings?chainId=1&owner=${owner}`, {
    signal: controller.signal,
  });
  mocks.scan.mockImplementation(async () => {
    controller.abort();
    throw new Error("aborted");
  });
  await expect(GET(req)).rejects.toMatchObject({
    name: "AbortError",
  });
});

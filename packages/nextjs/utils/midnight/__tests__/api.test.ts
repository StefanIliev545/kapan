import { NextRequest } from "next/server";
import { GET } from "../../../app/api/midnight/[chainId]/[resource]/route";
import fixture from "./live-base-fixture.json";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
const run = (resource: string, query = "", chainId = "8453") =>
  GET(new NextRequest(`http://localhost/api/midnight/${chainId}/${resource}?${query}`), {
    params: Promise.resolve({ chainId, resource }),
  });
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());
describe("Midnight API proxy", () => {
  it("rejects unsupported chains and malformed addresses without outbound requests", async () => {
    expect((await run("markets", "", "10")).status).toBe(400);
    expect((await run("markets", "loan=evil")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("follows cursors and validates each immutable market identity", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ data: [fixture.market], cursor: "next" }))
      .mockResolvedValueOnce(Response.json({ data: [], cursor: null }));
    const response = await run("markets");
    expect(response.status).toBe(200);
    expect((await response.json()).data).toHaveLength(1);
    expect(fetchMock.mock.calls[1][0]).toContain("cursor=next");
    expect(fetchMock.mock.calls[0][0]).toContain("limit=20");
  });
  it("rejects a repeating cursor instead of presenting incomplete offers", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(Response.json({ data: [], cursor: "same" })));
    expect((await run("markets")).status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("rejects a market whose oracle has been substituted", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ data: [{ ...fixture.market, loan_token: "0x0000000000000000000000000000000000000001" }] }),
    );
    expect((await run("markets")).status).toBe(502);
  });
  it("does not expose credential-bearing upstream errors", async () => {
    fetchMock.mockRejectedValue(new Error("https://rpc.example/private-secret"));
    const response = await run("markets");
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("private-secret");
  });
  it("returns an actionable unavailable-liquidity error", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 422 }));
    const response = await run("markets");
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("smaller amount");
  });
});

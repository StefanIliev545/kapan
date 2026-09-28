import { NextRequest, NextResponse } from "next/server";
import { type Address, createPublicClient, http, parseAbi } from "viem";
import { base, mainnet } from "viem/chains";
import { z } from "zod";
import { validateMarket } from "~~/utils/midnight/quotes";
import {
  MIDNIGHT_ADDRESSES,
  type MidnightMarket,
  addressSchema,
  bookSchema,
  idSchema,
  positionSchema,
  quoteSchema,
  uintSchema,
} from "~~/utils/midnight/types";

const ORIGIN = "https://api.morpho.org/v0/midnight";
class UpstreamError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
async function upstream(path: string, params = new URLSearchParams()) {
  const response = await fetch(`${ORIGIN}/${path}?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    if (response.status === 422)
      throw new UpstreamError(
        "Not enough lender offers for this amount. Try a smaller amount or another maturity.",
        422,
      );
    throw new UpstreamError(
      response.status === 429 ? "Morpho is busy. Retry the quote shortly." : "Morpho data is temporarily unavailable.",
      response.status === 429 ? 429 : 502,
    );
  }
  return await response.json();
}
async function pages(path: string, params: URLSearchParams) {
  const items: unknown[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const page = await upstream(path, params);
    if (!Array.isArray(page.data)) throw new UpstreamError("Unexpected Morpho response.");
    items.push(...page.data);
    if (!page.cursor) return items;
    if (typeof page.cursor !== "string" || seen.has(page.cursor)) throw new UpstreamError("Invalid Morpho pagination.");
    seen.add(page.cursor);
    params.set("cursor", page.cursor);
  }
  throw new UpstreamError("Morpho returned too many results. Narrow the market search.");
}
async function marketById(id: string, chainId: number): Promise<MidnightMarket> {
  const { data } = await upstream(`markets/${id}`);
  const market = bookSchema.parse({
    ...data,
    midnight: data.midnight ?? MIDNIGHT_ADDRESSES[chainId],
    market_id: id,
    bids: [],
  });
  validateMarket(market, chainId);
  return market;
}
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ chainId: string; resource: string }> },
) {
  try {
    const { chainId: rawChain, resource } = await params,
      chainId = Number(rawChain);
    if (!MIDNIGHT_ADDRESSES[chainId])
      return NextResponse.json(
        { error: "Fixed-rate Morpho markets are available on Ethereum and Base." },
        { status: 400 },
      );
    const query = request.nextUrl.searchParams;
    if (resource === "markets") {
      const filter = new URLSearchParams({ chain_ids: String(chainId), limit: "20", sort: "maturity" });
      if (query.has("loan")) filter.set("loan_tokens", addressSchema.parse(query.get("loan")));
      const data = z.array(bookSchema).parse(await pages("books", filter));
      for (const m of data) validateMarket(m, chainId);
      return NextResponse.json(
        { data },
        { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=15" } },
      );
    }
    if (resource === "positions") {
      const user = addressSchema.parse(query.get("user"));
      const positions = z
        .array(positionSchema)
        .parse(
          await pages(`users/${user}/positions`, new URLSearchParams({ chain_ids: String(chainId), limit: "20" })),
        );
      const selected = positions.filter(
        p =>
          p.chain_id === chainId &&
          p.user_address.toLowerCase() === user.toLowerCase() &&
          (BigInt(p.debt) > 0n || BigInt(p.credit) > 0n || p.collaterals.some(c => BigInt(c.amount) > 0n)),
      );
      // Details include past maturities and markets no longer listed on the orderbook.
      const tracked = (query.get("markets") || "").split(",").filter(Boolean);
      if (tracked.length > 64) throw new UpstreamError("Too many tracked markets.", 400);
      for (const raw of tracked) {
        const id = idSchema.parse(raw);
        if (selected.some(p => p.market_id.toLowerCase() === id.toLowerCase())) continue;
        const market = await marketById(id, chainId);
        selected.push({
          chain_id: chainId,
          market_id: id,
          user_address: user,
          loan_token: market.loan_token,
          maturity: market.maturity,
          credit: "0",
          debt: "0",
          pending_fee: "0",
          collaterals: [],
          type: "collateral_only",
        });
      }
      const data = await Promise.all(
        selected.map(async p => {
          const market = await marketById(p.market_id, chainId);
          return { ...p, loan_token: market.loan_token, maturity: market.maturity, market };
        }),
      );
      return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
    }
    if (resource === "quote") {
      const id = idSchema.parse(query.get("market")),
        assets = uintSchema.parse(query.get("assets"));
      if (BigInt(assets) === 0n || BigInt(assets) >= 1n << 128n)
        throw new UpstreamError("Enter a valid borrowing amount.", 400);
      const market = await marketById(id, chainId);
      const result = quoteSchema.parse(
        (await upstream(`books/${id}/bids/quote`, new URLSearchParams({ assets, slippage: "0.5", limit: "32" }))).data,
      );
      const client = createPublicClient({
        chain: chainId === 8453 ? base : mainnet,
        transport: http(chainId === 8453 ? process.env.BASE_RPC_URL : process.env.ETHEREUM_RPC_URL, { timeout: 15000 }),
      });
      const block = await client.getBlock();
      const now = Number(block.timestamp);
      if (now >= market.maturity) throw new UpstreamError("This loan has matured. Choose another maturity.", 422);
      const abi = parseAbi([
        "function settlementFee(bytes32,uint256) view returns(uint256)",
        "function consumed(address,bytes32) view returns(uint256)",
      ]);
      const settlementFee = await client.readContract({
        address: market.midnight,
        abi,
        functionName: "settlementFee",
        args: [id, BigInt(market.maturity) - block.timestamp],
        blockNumber: block.number,
      });
      const consumed = await Promise.all(
        result.takeable_offers.map(t =>
          client.readContract({
            address: market.midnight,
            abi,
            functionName: "consumed",
            args: [t.offer.maker as Address, t.offer.group],
            blockNumber: block.number,
          }),
        ),
      );
      return NextResponse.json(
        {
          data: {
            ...result,
            market,
            assets,
            fetchedAt: now,
            settlementFee: settlementFee.toString(),
            consumed: consumed.map(String),
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json({ error: "Unknown Midnight resource." }, { status: 404 });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : error instanceof UpstreamError ? error.status : 502;
    const message =
      error instanceof z.ZodError
        ? "Invalid Midnight request or response."
        : error instanceof UpstreamError
          ? error.message
          : "Unable to load Midnight data. Refresh and try again.";
    return NextResponse.json({ error: message }, { status });
  }
}

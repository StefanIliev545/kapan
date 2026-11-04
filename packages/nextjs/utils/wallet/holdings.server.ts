import { isAddress, type Address } from "viem";
import { incompleteScan, rawBalance, validDecimals, type Holding, type HoldingsScan } from "./holdings";
const NETWORKS: Record<number, string> = {
  1: "eth-mainnet",
  42161: "arb-mainnet",
  8453: "base-mainnet",
  10: "opt-mainnet",
  59144: "linea-mainnet",
  130: "unichain-mainnet",
};
type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" ? (value as JsonObject) : {};
}
function hasPartialErrors(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value !== undefined && value !== null && (typeof value !== "object" || Object.keys(value).length > 0);
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.slice(0, 120) : null;
}
function parseHolding(value: unknown, network: string, owner: string): Holding | null {
  const token = object(value);
  const matchesWallet =
    token.network === network && typeof token.address === "string" && token.address.toLowerCase() === owner;
  const validContract =
    typeof token.tokenAddress === "string" &&
    isAddress(token.tokenAddress, {
      strict: false,
    });
  const nativeContract = typeof token.tokenAddress === "string" && /^0x0{40}$/i.test(token.tokenAddress);
  if (!matchesWallet || !validContract || nativeContract) {
    return null;
  }
  const address = (token.tokenAddress as string).toLowerCase() as Address;
  const metadata = object(token.tokenMetadata);
  const balance = rawBalance(token.tokenBalance);
  const prices = Array.isArray(token.tokenPrices) ? token.tokenPrices : [];
  const usd = prices.map(object).find((price) => {
    return (
      price.currency === "usd" &&
      typeof price.value === "string" &&
      price.value.trim() !== "" &&
      Number.isFinite(Number(price.value)) &&
      Number(price.value) >= 0
    );
  });
  const holding: Holding = {
    address,
    rawBalance: balance,
    decimals: validDecimals(metadata.decimals) ? metadata.decimals : null,
    name: text(metadata.name),
    symbol: text(metadata.symbol),
    price: usd ? Number(usd.value) : null,
    classification: "unknown",
    issues: [],
  };
  if (balance === null) {
    holding.issues.push({
      kind: "balance",
      code: "malformed",
      address,
    });
  }
  if (token.error || holding.decimals === null || !holding.symbol || !holding.name) {
    holding.issues.push({
      kind: "metadata",
      code: "missing",
      address,
    });
  }
  if (holding.price === null) {
    holding.issues.push({
      kind: "price",
      code: "missing",
      address,
    });
  }
  return holding;
}
function addEnumerationIssue(scan: HoldingsScan, code: HoldingsScan["issues"][number]["code"]): void {
  scan.issues.push({
    kind: "enumeration",
    code,
  });
}
async function requestPortfolioPage(
  scan: HoldingsScan,
  network: string,
  apiKey: string,
  deadline: number,
  pageKey: string | undefined,
  signal?: AbortSignal,
): Promise<JsonObject | undefined> {
  signal?.throwIfAborted();
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    addEnumerationIssue(scan, "timeout");
    return undefined;
  }
  const controller = new AbortController();
  const cancel = () => {
    controller.abort();
  };
  signal?.addEventListener("abort", cancel, {
    once: true,
  });
  const timeout = setTimeout(cancel, Math.min(10000, remaining));
  try {
    const response = await fetch(
      `https://api.g.alchemy.com/data/v1/${encodeURIComponent(apiKey)}/assets/tokens/by-address`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          addresses: [
            {
              address: scan.owner,
              networks: [network],
            },
          ],
          withMetadata: true,
          withPrices: true,
          includeNativeTokens: false,
          includeErc20Tokens: true,
          ...(pageKey
            ? {
                pageKey,
              }
            : {}),
        }),
        signal: controller.signal,
        cache: "no-store",
      },
    );
    if (!response.ok) {
      addEnumerationIssue(scan, "unavailable");
      return undefined;
    }
    const payload = object(await response.json());
    controller.signal.throwIfAborted();
    if (Date.now() >= deadline) {
      addEnumerationIssue(scan, "timeout");
      return undefined;
    }
    return payload;
  } catch {
    signal?.throwIfAborted();
    addEnumerationIssue(scan, controller.signal.aborted ? "timeout" : "unavailable");
    return undefined;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
function mergePageRecords(scan: HoldingsScan, records: Map<string, Holding>, tokens: unknown[], network: string): void {
  for (const value of tokens) {
    const holding = parseHolding(value, network, scan.owner);
    if (!holding) {
      addEnumerationIssue(scan, "malformed");
      continue;
    }
    const existing = records.get(holding.address);
    if (existing && JSON.stringify(existing) !== JSON.stringify(holding)) {
      addEnumerationIssue(scan, "partial");
    }
    records.set(holding.address, existing ?? holding);
  }
}
function readPage(
  scan: HoldingsScan,
  payload: JsonObject,
  records: Map<string, Holding>,
  network: string,
): {
  valid: boolean;
  next: unknown;
} {
  const data = object(payload.data);
  const partialFailure =
    payload.error || hasPartialErrors(payload.partialErrors) || hasPartialErrors(data.partialErrors);
  if (partialFailure) {
    addEnumerationIssue(scan, "partial");
  }
  if (!Array.isArray(data.tokens)) {
    addEnumerationIssue(scan, "malformed");
    return {
      valid: false,
      next: undefined,
    };
  }
  mergePageRecords(scan, records, data.tokens, network);
  return {
    valid: true,
    next: data.pageKey ?? payload.pageKey,
  };
}
function isExhaustedCursor(next: unknown): boolean {
  return next === undefined || next === null || next === "";
}
function canFollowCursor(next: unknown, cursors: Set<string>, page: number): next is string {
  const validCursor = typeof next === "string" && next.length <= 4096;
  const repeatedCursor = typeof next === "string" && cursors.has(next);
  const pageLimitReached = page === 19;
  return validCursor && !repeatedCursor && !pageLimitReached;
}
export async function scanHoldings(
  chainId: number,
  owner: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<HoldingsScan> {
  signal?.throwIfAborted();
  const network = NETWORKS[chainId];
  if (!network) {
    return incompleteScan(chainId, owner, "unsupported");
  }
  if (
    !apiKey ||
    !isAddress(owner, {
      strict: false,
    })
  ) {
    return incompleteScan(chainId, owner, "unavailable");
  }
  const scan = incompleteScan(chainId, owner, "unavailable");
  scan.issues = [];
  const records = new Map<string, Holding>();
  const cursors = new Set<string>();
  const deadline = Date.now() + 30000;
  let pageKey: string | undefined;
  for (let page = 0; page < 20; page++) {
    const payload = await requestPortfolioPage(scan, network, apiKey, deadline, pageKey, signal);
    if (!payload) {
      break;
    }
    const result = readPage(scan, payload, records, network);
    if (!result.valid) {
      break;
    }
    if (isExhaustedCursor(result.next)) {
      scan.enumerationComplete = scan.issues.length === 0;
      break;
    }
    if (!canFollowCursor(result.next, cursors, page)) {
      addEnumerationIssue(scan, "pagination");
      break;
    }
    cursors.add(result.next);
    pageKey = result.next;
  }
  signal?.throwIfAborted();
  scan.holdings = Array.from(records.values());
  return scan;
}

import { isAddress, type Address } from "viem";
export interface HoldingsIssue {
  kind: "enumeration" | "balance" | "metadata" | "price";
  code: "unsupported" | "unavailable" | "timeout" | "malformed" | "partial" | "pagination" | "missing";
  address?: Address;
}
export interface Holding {
  address: Address;
  rawBalance: string | null;
  decimals: number | null;
  name: string | null;
  symbol: string | null;
  price: number | null;
  classification: "unknown";
  issues: HoldingsIssue[];
}
export interface HoldingsScan {
  chainId: number;
  owner: string;
  holdings: Holding[];
  enumerationComplete: boolean;
  issues: HoldingsIssue[];
}
export function validDecimals(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;
}
export function rawBalance(value: unknown): string | null {
  if (typeof value !== "string" || !/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(value) || value.length > 80) {
    return null;
  }
  const balance = BigInt(value);
  return balance < 2n ** 256n ? balance.toString() : null;
}
export function incompleteScan(chainId: number, owner: string, code: HoldingsIssue["code"]): HoldingsScan {
  return {
    chainId,
    owner: owner.toLowerCase(),
    holdings: [],
    enumerationComplete: false,
    issues: [
      {
        kind: "enumeration",
        code,
      },
    ],
  };
}
function isHolding(value: unknown): value is Holding {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const holding = value as Partial<Holding>;
  const validAddress =
    typeof holding.address === "string" &&
    isAddress(holding.address, {
      strict: false,
    });
  const validBalance = holding.rawBalance === null || rawBalance(holding.rawBalance) !== null;
  const validScale = holding.decimals === null || validDecimals(holding.decimals);
  const validPrice =
    holding.price === null ||
    (typeof holding.price === "number" && Number.isFinite(holding.price) && holding.price >= 0);
  const validLabels =
    (holding.name === null || typeof holding.name === "string") &&
    (holding.symbol === null || typeof holding.symbol === "string");
  return (
    validAddress &&
    validBalance &&
    validScale &&
    validPrice &&
    validLabels &&
    Array.isArray(holding.issues) &&
    holding.classification === "unknown"
  );
}
function isMatchingScan(value: unknown, chainId: number, owner: string): value is HoldingsScan {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const scan = value as Partial<HoldingsScan>;
  const matchesWallet = scan.chainId === chainId && scan.owner === owner.toLowerCase();
  const validEnvelope = typeof scan.enumerationComplete === "boolean" && Array.isArray(scan.issues);
  const validHoldings = Array.isArray(scan.holdings) && scan.holdings.every(isHolding);
  return matchesWallet && validEnvelope && validHoldings;
}
export async function fetchHoldings(chainId: number, owner: string, signal?: AbortSignal): Promise<HoldingsScan> {
  try {
    const response = await fetch(`/api/wallet/holdings?chainId=${chainId}&owner=${encodeURIComponent(owner)}`, {
      signal,
    });
    if (!response.ok) {
      return incompleteScan(chainId, owner, "unavailable");
    }
    const scan: unknown = await response.json();
    if (!isMatchingScan(scan, chainId, owner)) {
      return incompleteScan(chainId, owner, "malformed");
    }
    return scan;
  } catch {
    signal?.throwIfAborted();
    return incompleteScan(chainId, owner, "unavailable");
  }
}

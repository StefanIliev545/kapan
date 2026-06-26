import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, getAddress, type Address, type PublicClient } from "viem";
import { mainnet, base, arbitrum, optimism, unichain, linea } from "viem/chains";

/**
 * Euler V2 Positions API — on-chain discovery via the EVC.
 *
 * Previously this read positions from the Euler subgraph (`trackingActiveAccount`). That source
 * lags and omits positions (e.g. a freshly-refinanced PT borrow showed `borrows: []` even though
 * the borrow existed on-chain), so positions silently went missing. We now enumerate positions
 * the same way Euler's own app does: directly from the Ethereum Vault Connector (EVC).
 *
 * EVC model: an owner address has 256 sub-accounts (first 19 bytes shared, last byte = id ^ ...).
 * For each sub-account, `getControllers` returns its debt vault (≤1) and `getCollaterals` returns
 * its enabled collateral vaults. We derive all 256 sub-accounts and batch every read through
 * multicall3 (≈ a handful of RPC round-trips). Vault metadata (asset/symbol/decimals) is read
 * on-chain so an un-indexed vault is never dropped; APYs are best-effort enriched from the
 * subgraph (0 when unavailable — the position still shows correctly).
 */

const RPC_ENDPOINTS: Record<number, { url: string; chain: any }> = (() => {
  const A = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
  const mk = (slug: string, pub: string) => (A ? `https://${slug}.g.alchemy.com/v2/${A}` : pub);
  return {
    1: { url: mk("eth-mainnet", "https://ethereum-rpc.publicnode.com"), chain: mainnet },
    10: { url: mk("opt-mainnet", "https://optimism-rpc.publicnode.com"), chain: optimism },
    130: { url: mk("unichain-mainnet", "https://unichain-rpc.publicnode.com"), chain: unichain },
    8453: { url: mk("base-mainnet", "https://base-rpc.publicnode.com"), chain: base },
    42161: { url: mk("arb-mainnet", "https://arbitrum-one-rpc.publicnode.com"), chain: arbitrum },
    59144: { url: mk("linea-mainnet", "https://linea-rpc.publicnode.com"), chain: linea },
  };
})();

// Euler EVC (Ethereum Vault Connector) per chain — verified on-chain via vault.EVC().
const EVC_ADDRESSES: Record<number, Address> = {
  1: "0x0C9a3dd6b8F28529d72d7f9cE918D493519EE383",
  10: "0xbfB28650Cd13CE879E7D56569Ed4715c299823E4",
  130: "0x2A1176964F5D7caE5406B627Bf6166664FE83c60",
  8453: "0x5301c7dD20bD945D2013b48ed0DEE3A284ca8989",
  42161: "0x6302ef0F34100CDDFb5489fbcB6eE1AA95CD1066",
  59144: "0xd8CeCEe9A04eA3d941a959F68fb4486f23271d09",
};

// Subgraph (best-effort APY enrichment only — never used for discovery).
const EULER_SUBGRAPH_URLS: Record<number, string> = {
  1: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-mainnet/latest/gn",
  10: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-optimism/latest/gn",
  130: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-unichain/latest/gn",
  8453: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-base/latest/gn",
  42161: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-arbitrum/latest/gn",
  59144: "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-linea/latest/gn",
};

const EVC_ABI = [
  { name: "getCollaterals", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "address[]" }] },
  { name: "getControllers", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "address[]" }] },
] as const;

const VAULT_ABI = [
  { name: "asset", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

const ERC20_ABI = [
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

// ---- exported types (unchanged — consumed by useEulerLendingPositions) ----
export interface EulerVaultInfo {
  address: string;
  name: string;
  symbol: string;
  asset: { address: string; symbol: string; decimals: number };
  supplyApy: number;
  borrowApy: number;
}
export interface EulerCollateralPosition { vault: EulerVaultInfo }
export interface EulerPositionGroup {
  subAccount: string;
  isMainAccount: boolean;
  debt: { vault: EulerVaultInfo } | null;
  collaterals: EulerCollateralPosition[];
}
export interface EulerPositionResponse {
  vault: EulerVaultInfo;
  supplyShares: string;
  borrowShares: string;
}

/** EVC sub-accounts: 256 addresses sharing the owner's first 19 bytes, last byte 0x00..0xff. */
function deriveSubAccounts(owner: Address): Address[] {
  const base = (BigInt(owner) >> 8n) << 8n;
  return Array.from({ length: 256 }, (_, i) => getAddress("0x" + (base | BigInt(i)).toString(16).padStart(40, "0")));
}

/** Best-effort APY map (RAY → decimal) keyed by vault address. Empty on any subgraph hiccup. */
async function fetchApyMap(chainId: number, vaultIds: string[]): Promise<Map<string, { supplyApy: number; borrowApy: number }>> {
  const map = new Map<string, { supplyApy: number; borrowApy: number }>();
  const url = EULER_SUBGRAPH_URLS[chainId];
  if (!url || vaultIds.length === 0) return map;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: `query($ids:[ID!]!){ eulerVaults(where:{id_in:$ids}){ id state{ supplyApy borrowApy } } }`, variables: { ids: vaultIds } }),
      next: { revalidate: 60 },
    });
    const json = await res.json();
    for (const v of json.data?.eulerVaults ?? []) {
      map.set((v.id as string).toLowerCase(), {
        supplyApy: parseFloat(v.state?.supplyApy || "0") / 1e27,
        borrowApy: parseFloat(v.state?.borrowApy || "0") / 1e27,
      });
    }
  } catch {
    /* APY is best-effort */
  }
  return map;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ chainId: string }> }) {
  const { chainId: chainIdStr } = await params;
  const chainId = parseInt(chainIdStr, 10);
  const searchParams = request.nextUrl.searchParams;
  const forkChainId = chainId === 31337 ? parseInt(searchParams.get("forkChainId") || "42161", 10) : chainId;
  const userParam = searchParams.get("user");

  const cfg = RPC_ENDPOINTS[forkChainId];
  const evc = EVC_ADDRESSES[forkChainId];
  if (!cfg || !evc) return NextResponse.json({ error: `Chain ${forkChainId} not supported for Euler V2` }, { status: 400 });
  if (!userParam) return NextResponse.json({ error: "Missing user address parameter" }, { status: 400 });

  let user: Address;
  try { user = getAddress(userParam); } catch { return NextResponse.json({ error: "Invalid user address" }, { status: 400 }); }

  try {
    const client = createPublicClient({ chain: cfg.chain, transport: http(cfg.url) }) as PublicClient;
    const subs = deriveSubAccounts(user);

    // 1) EVC discovery — collaterals + controllers per sub-account (multicall).
    const [collRes, ctrlRes] = await Promise.all([
      client.multicall({ contracts: subs.map(s => ({ address: evc, abi: EVC_ABI, functionName: "getCollaterals" as const, args: [s] as const })), allowFailure: true }),
      client.multicall({ contracts: subs.map(s => ({ address: evc, abi: EVC_ABI, functionName: "getControllers" as const, args: [s] as const })), allowFailure: true }),
    ]);

    interface SubPos { subAccount: Address; collaterals: Address[]; controller: Address | null }
    const subPositions: SubPos[] = [];
    const vaultSet = new Set<string>();
    subs.forEach((s, i) => {
      const collaterals = (collRes[i].status === "success" ? (collRes[i].result as Address[]) : []);
      const controllers = (ctrlRes[i].status === "success" ? (ctrlRes[i].result as Address[]) : []);
      if (collaterals.length === 0 && controllers.length === 0) return;
      collaterals.forEach(v => vaultSet.add(v.toLowerCase()));
      if (controllers[0]) vaultSet.add(controllers[0].toLowerCase());
      subPositions.push({ subAccount: s, collaterals, controller: controllers[0] ?? null });
    });

    if (subPositions.length === 0) return NextResponse.json({ positions: [], positionGroups: [] });

    // 2) On-chain vault metadata (asset/symbol/name) — never depends on the subgraph.
    const vaults = Array.from(vaultSet).map(v => getAddress(v));
    const metaRes = await client.multicall({
      contracts: vaults.flatMap(v => [
        { address: v, abi: VAULT_ABI, functionName: "asset" as const },
        { address: v, abi: VAULT_ABI, functionName: "symbol" as const },
        { address: v, abi: VAULT_ABI, functionName: "name" as const },
      ]),
      allowFailure: true,
    });
    const vaultAsset = new Map<string, Address>();
    const vaultSymbol = new Map<string, string>();
    const vaultName = new Map<string, string>();
    vaults.forEach((v, i) => {
      const a = metaRes[i * 3], s = metaRes[i * 3 + 1], n = metaRes[i * 3 + 2];
      if (a.status === "success") vaultAsset.set(v.toLowerCase(), getAddress(a.result as Address));
      vaultSymbol.set(v.toLowerCase(), s.status === "success" ? (s.result as string) : "?");
      vaultName.set(v.toLowerCase(), n.status === "success" ? (n.result as string) : "Euler Vault");
    });

    // 3) Underlying asset symbol + decimals (multicall).
    const assets = Array.from(new Set(Array.from(vaultAsset.values()).map(a => a.toLowerCase()))).map(a => getAddress(a));
    const assetRes = await client.multicall({
      contracts: assets.flatMap(a => [
        { address: a, abi: ERC20_ABI, functionName: "symbol" as const },
        { address: a, abi: ERC20_ABI, functionName: "decimals" as const },
      ]),
      allowFailure: true,
    });
    const assetSymbol = new Map<string, string>();
    const assetDecimals = new Map<string, number>();
    assets.forEach((a, i) => {
      const s = assetRes[i * 2], d = assetRes[i * 2 + 1];
      assetSymbol.set(a.toLowerCase(), s.status === "success" ? (s.result as string) : "?");
      assetDecimals.set(a.toLowerCase(), d.status === "success" ? Number(d.result) : 18);
    });

    // 4) Best-effort APY enrichment from the subgraph.
    const apy = await fetchApyMap(forkChainId, vaults.map(v => v.toLowerCase()));

    const buildVaultInfo = (vaultAddr: Address): EulerVaultInfo => {
      const key = vaultAddr.toLowerCase();
      const assetAddr = vaultAsset.get(key) ?? ("0x0000000000000000000000000000000000000000" as Address);
      const akey = assetAddr.toLowerCase();
      const rates = apy.get(key) ?? { supplyApy: 0, borrowApy: 0 };
      return {
        address: vaultAddr,
        name: vaultName.get(key) ?? "Euler Vault",
        symbol: vaultSymbol.get(key) ?? "?",
        asset: { address: assetAddr, symbol: assetSymbol.get(akey) ?? "?", decimals: assetDecimals.get(akey) ?? 18 },
        supplyApy: rates.supplyApy,
        borrowApy: rates.borrowApy,
      };
    };

    // 5) Build position groups (1 debt + N collaterals per sub-account) + legacy positions.
    const positionGroups: EulerPositionGroup[] = subPositions
      .map(sp => ({
        subAccount: sp.subAccount,
        isMainAccount: sp.subAccount.toLowerCase() === user.toLowerCase(),
        debt: sp.controller ? { vault: buildVaultInfo(sp.controller) } : null,
        collaterals: sp.collaterals.map(v => ({ vault: buildVaultInfo(v) })),
      }))
      .sort((a, b) => (a.isMainAccount === b.isMainAccount ? a.subAccount.localeCompare(b.subAccount) : a.isMainAccount ? -1 : 1));

    const seen = new Set<string>();
    const positions: EulerPositionResponse[] = [];
    for (const g of positionGroups) {
      for (const c of g.collaterals) {
        if (seen.has(c.vault.address.toLowerCase())) continue;
        seen.add(c.vault.address.toLowerCase());
        positions.push({ vault: c.vault, supplyShares: "1", borrowShares: "0" });
      }
      if (g.debt) {
        const k = g.debt.vault.address.toLowerCase();
        const existing = positions.find(p => p.vault.address.toLowerCase() === k);
        if (existing) existing.borrowShares = "1";
        else { seen.add(k); positions.push({ vault: g.debt.vault, supplyShares: "0", borrowShares: "1" }); }
      }
    }

    return NextResponse.json({ positions, positionGroups });
  } catch (error) {
    console.error("[euler/positions] Error:", error);
    return NextResponse.json({ error: "Failed to fetch positions" }, { status: 500 });
  }
}

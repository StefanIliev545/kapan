export const qk = {
  user: (id?: string) => ["user", id ?? ""] as const,
  tokenMeta: (chainId: number, token?: string) => ["tokenMeta", chainId, token?.toLowerCase() ?? ""] as const,
  tokenPrice: (chainId: number, token?: string) => ["tokenPrice", chainId, token?.toLowerCase() ?? ""] as const,
  balances: (chainId: number, address?: string) => ["balances", chainId, address?.toLowerCase() ?? ""] as const,
  balanceOf: (chainId: number, address?: string, token?: string) =>
    ["balanceOf", chainId, address?.toLowerCase() ?? "", token?.toLowerCase() ?? ""] as const,
  positions: (chainId: number, address?: string) => ["positions", chainId, address?.toLowerCase() ?? ""] as const,
  eventHistory: (
    chainId: number,
    address?: string,
    contractName?: string,
    eventName?: string,
    fromBlock?: string,
    filtersKey?: string,
  ) =>
    [
      "eventHistory",
      chainId,
      address?.toLowerCase() ?? "",
      contractName ?? "",
      eventName ?? "",
      fromBlock ?? "",
      filtersKey ?? "",
    ] as const,

  // ============ Protocol Query Keys ============
  // Hierarchical pattern: ['protocol', chainId, 'resource', ...specificParams]
  // This enables both specific invalidation and broad protocol-level invalidation

  // Morpho Blue
  morpho: {
    // Base key for all morpho queries on a chain
    all: (chainId: number) => ["morpho", chainId] as const,
    // Markets list (optionally filtered by search)
    markets: (chainId: number, search?: string) =>
      search ? (["morpho", chainId, "markets", search] as const) : (["morpho", chainId, "markets"] as const),
    // User positions
    positions: (chainId: number, userAddress?: string) =>
      ["morpho", chainId, "positions", userAddress?.toLowerCase() ?? ""] as const,
    // Market support check (for refinance UI)
    marketSupport: (chainId: number) => ["morpho", chainId, "market-support"] as const,
    // Collateral swap markets
    collateralSwapMarkets: (chainId: number) => ["morpho", chainId, "collateral-swap-markets"] as const,
    // Debt swap markets
    debtSwapMarkets: (chainId: number) => ["morpho", chainId, "debt-swap-markets"] as const,
  },

  // Euler V2
  euler: {
    // Base key for all euler queries on a chain
    all: (chainId: number) => ["euler", chainId] as const,
    // Vaults list (optionally filtered by search)
    vaults: (chainId: number, search?: string) =>
      search ? (["euler", chainId, "vaults", search] as const) : (["euler", chainId, "vaults"] as const),
    // User positions
    positions: (chainId: number, userAddress?: string) =>
      ["euler", chainId, "positions", userAddress?.toLowerCase() ?? ""] as const,
    // Vault support check (for refinance UI)
    vaultSupport: (chainId: number) => ["euler", chainId, "vault-support"] as const,
    // Collateral swap vaults
    collateralSwapVaults: (chainId: number) => ["euler", chainId, "collateral-swap-vaults"] as const,
    // Debt swap vaults
    debtSwapVaults: (chainId: number) => ["euler", chainId, "debt-swap-vaults"] as const,
  },
};

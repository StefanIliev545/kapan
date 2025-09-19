export const qk = {
  user: (id: string) => ["user", id] as const,
  tokenMeta: (chainId: number, token: string) => ["tokenMeta", chainId, token.toLowerCase()] as const,
  tokenPrice: (chainId: number, token: string) => ["tokenPrice", chainId, token.toLowerCase()] as const,
  balances: (chainId: number, address: string) => ["balances", chainId, address.toLowerCase()] as const,
  balanceOf: (chainId: number, address: string, token: string) =>
    ["balanceOf", chainId, address.toLowerCase(), token.toLowerCase()] as const,
  positions: (chainId: number, address: string) => ["positions", chainId, address.toLowerCase()] as const,
  mockData: () => ["mockData"] as const,
  eventHistory: (
    chainId: number,
    address: string,
    contractName: string,
    eventName: string,
    fromBlock: string,
    filtersKey?: string,
  ) =>
    [
      "eventHistory",
      chainId,
      address.toLowerCase(),
      contractName,
      eventName,
      fromBlock,
      filtersKey ?? "",
    ] as const,
};

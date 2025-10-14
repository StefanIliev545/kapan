// Centralized Vesu pool constants (V1 pool IDs and V2 pool addresses)

export const VESU_V1_POOLS = {
  Genesis: 2198503327643286920898110335698706244522220458610657370981979460625005526824n,
  CarmineRunes: 0x05ed7f4a51687a544b1a596dc5b30743dbd0b633197e5de9f6281cdf64f8a44bn,
  Re7StarknetEcosystem: 0x06febb313566c48e30614ddab092856a9ab35b80f359868ca69b2649ca5d148dn,
  Re7xSTRK: 0x052fb52363939c3aa848f8f4ac28f0a51379f8d1b971d8444de25fbd77d8f161n,
} as const;

export type VesuV1PoolName = keyof typeof VESU_V1_POOLS;

export const VESU_V2_POOLS = {
  Default: "0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5",
  Re7xBTC: "0x03a8416bf20d036df5b1cf3447630a2e1cb04685f6b0c3a70ed7fb1473548ecf",
  Re7USDCCore: "0x03976cac265a12609934089004df458ea29c776d77da423c96dc761d09d24124",
  Re7USDCPrime: "0x02eef0c13b10b487ea5916b54c0a7f98ec43fb3048f60fdeedaf5b08f6f88aaf",
  Re7USDCStableCore: "0x073702fce24aba36da1eac539bd4bae62d4d6a76747b7cdd3e016da754d7a135",
} as const;

export type VesuV2PoolName = keyof typeof VESU_V2_POOLS;

export const getV1PoolNameFromId = (poolId: bigint): VesuV1PoolName | "Unknown" => {
  const entry = Object.entries(VESU_V1_POOLS).find(([, id]) => id === poolId);
  return (entry?.[0] as VesuV1PoolName) ?? "Unknown";
};

export const getV2PoolNameFromAddress = (poolAddress: string): VesuV2PoolName | "Unknown" => {
  const normalized = poolAddress.toLowerCase();
  const entry = Object.entries(VESU_V2_POOLS).find(([, addr]) => addr.toLowerCase() === normalized);
  return (entry?.[0] as VesuV2PoolName) ?? "Unknown";
};

// Pretty display names and icons (currently using Vesu icon for all)
const POOL_DISPLAY_NAMES_V1: Record<VesuV1PoolName, string> = {
  Genesis: "Genesis",
  CarmineRunes: "CarmineDAO Runes",
  Re7StarknetEcosystem: "Re7 Starknet Ecosystem",
  Re7xSTRK: "Re7 xSTRK",
};

const POOL_DISPLAY_NAMES_V2: Record<VesuV2PoolName, string> = {
  Default: "Default",
  Re7xBTC: "Re7 xBTC",
  Re7USDCCore: "Re7 USDC Core",
  Re7USDCPrime: "Re7 USDC Prime",
  Re7USDCStableCore: "Re7 USDC Stable Core",
};

export const getV1PoolDisplay = (name: VesuV1PoolName) => ({
  name: POOL_DISPLAY_NAMES_V1[name] ?? name,
  icon: "/logos/vesu.svg",
});

export const getV2PoolDisplay = (name: VesuV2PoolName) => ({
  name: POOL_DISPLAY_NAMES_V2[name] ?? name,
  icon: "/logos/vesu.svg",
});



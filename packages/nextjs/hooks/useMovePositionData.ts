import { useEffect, useMemo, useState } from "react";
import { useAccount as useEvmAccount } from "wagmi";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { useCollaterals as useEvmCollaterals } from "~~/hooks/scaffold-eth/useCollaterals";
import { useCollateralSupport as useEvmCollateralSupport } from "~~/hooks/scaffold-eth/useCollateralSupport";
import { useCollateral as useStarkCollaterals } from "~~/hooks/scaffold-stark/useCollateral";
import { getProtocolLogo } from "~~/utils/protocol";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { VESU_V1_POOLS, VESU_V2_POOLS } from "~~/components/specific/vesu/pools";
import { formatUnits } from "viem";

export type NetworkType = "evm" | "starknet";

export type MovePositionInput = {
  isOpen: boolean;
  networkType: NetworkType;
  fromProtocol: string; // e.g. "Aave V3" | "Compound V3" | "Venus" | "Vesu" | "VesuV2" | "Nostra"
  chainId?: number;
  // Minimal fields used across existing modals
  position: {
    name: string;
    tokenAddress: string;
    decimals: number;
    balance?: number | bigint; // borrowed balance; semantics differ across views
    poolId?: bigint | string; // for Vesu
    type: "borrow" | "supply";
  };
};

export type BasicCollateral = {
  address: string;
  symbol: string;
  icon: string;
  decimals: number;
  rawBalance: bigint;
  balance: number; // human-readable
  usdPrice?: bigint; // 1e8 scaled where available (EVM UiHelper)
};

export type FlashLoanProviderOption = {
  name: string;
  version: string;
  icon: string;
  providerEnum?: number; // matches router enum on EVM
};

export type DestinationProtocolOption = {
  name: string;
  logo: string;
};

export type VesuPoolsData = {
  v1Pools: { name: keyof typeof VESU_V1_POOLS; id: bigint }[];
  v2Pools: { name: keyof typeof VESU_V2_POOLS; address: string }[];
};

export type UseMovePositionDataResult = {
  // Debt token quick info for header
  debtSymbol: string;
  debtIcon: string;
  debtMaxRaw?: string; // full precision string for input (token units)
  debtMaxLabel?: string; // shorter display label
  // Source protocol
  sourceProtocol: { name: string; logo: string };
  // Collaterals and support
  collaterals: BasicCollateral[];
  isLoadingCollaterals: boolean;
  supportedCollateralMap?: Record<string, boolean>;
  // Prices (EVM)
  tokenToPrices?: Record<string, bigint>;
  // Destination protocol options
  destinationProtocols: DestinationProtocolOption[];
  // Flash loan
  flashLoanProviders: FlashLoanProviderOption[];
  defaultFlashLoanProvider?: FlashLoanProviderOption;
  // Vesu pools (if relevant)
  vesuPools?: VesuPoolsData;
};

// EVM-only provider chains
const BALANCER_CHAINS = [42161, 8453, 10]; // Arbitrum, Base, Optimism
const AAVE_CHAINS = [42161, 8453, 10, 59144]; // Arbitrum, Base, Optimism, Linea

export function useMovePositionData(params: MovePositionInput): UseMovePositionDataResult {
  const { isOpen, networkType, fromProtocol, chainId, position } = params;

  // Resolve user address for EVM
  const { address: evmUserAddress } = useEvmAccount();
  const zeroAddress = "0x0000000000000000000000000000000000000000";

  // Common: source protocol
  const sourceProtocol = useMemo(
    () => ({ name: fromProtocol, logo: getProtocolLogo(fromProtocol) }),
    [fromProtocol],
  );

  // Common: debt header info (best-effort)
  const debtSymbol = position.name;
  const debtIcon = tokenNameToLogo(position.name.toLowerCase());
  const { debtMaxRaw, debtMaxLabel } = useMemo(() => {
    try {
      if (typeof position.balance === "bigint") {
        const raw = formatUnits(position.balance, position.decimals);
        const normalized = raw.startsWith("-") ? raw.slice(1) : raw;
        const [int, dec = ""] = normalized.split(".");
        const short = dec ? `${int}.${dec.slice(0, 6).replace(/0+$/, "")}` : int;
        return { debtMaxRaw: normalized, debtMaxLabel: short };
      } else if (typeof position.balance === "number") {
        const absNum = Math.abs(position.balance);
        const full = absNum.toString();
        const [int, dec = ""] = full.split(".");
        const short = dec ? `${int}.${dec.slice(0, 6).replace(/0+$/, "")}` : int;
        return { debtMaxRaw: full, debtMaxLabel: short };
      }
    } catch {}
    return { debtMaxRaw: undefined, debtMaxLabel: undefined };
  }, [position.balance, position.decimals]);

  // Destination protocol options (simple baseline; caller can refine)
  const destinationProtocols: DestinationProtocolOption[] = useMemo(() => {
    if (networkType === "evm") {
      return [{ name: "Aave V3", logo: getProtocolLogo("Aave V3") }, { name: "Compound V3", logo: getProtocolLogo("Compound V3") }, { name: "Venus", logo: getProtocolLogo("Venus") }].filter(
        p => p.name.toLowerCase() !== fromProtocol.toLowerCase(),
      );
    }
    // Starknet: Vesu, VesuV2, Nostra
    return [{ name: "Vesu", logo: getProtocolLogo("Vesu") }, { name: "VesuV2", logo: getProtocolLogo("VesuV2") }, { name: "Nostra", logo: getProtocolLogo("Nostra") }].filter(
      p => p.name.toLowerCase() !== fromProtocol.toLowerCase(),
    );
  }, [fromProtocol, networkType]);

  // Collaterals and support
  const [collaterals, setCollaterals] = useState<BasicCollateral[]>([]);
  const [isLoadingCollaterals, setIsLoadingCollaterals] = useState(false);
  const [supportedCollateralMap, setSupportedCollateralMap] = useState<Record<string, boolean> | undefined>(undefined);

  // Prices map (EVM UiHelper 1e8 decimals)
  const [tokenToPrices, setTokenToPrices] = useState<Record<string, bigint> | undefined>(undefined);

  // EVM branch: collaterals, support, prices, flash loan provider detection
  const { collaterals: evmCollaterals, isLoading: evmIsLoadingCollats } = useEvmCollaterals(
    position.tokenAddress,
    fromProtocol,
    (evmUserAddress as string) || zeroAddress,
    isOpen && networkType === "evm",
  );
  const collateralAddresses = useMemo(() => evmCollaterals.map(c => c.address), [evmCollaterals]);
  const { isLoading: isLoadingSupport, supportedCollaterals } = useEvmCollateralSupport(
    destinationProtocols[0]?.name || "",
    position.tokenAddress,
    collateralAddresses,
    isOpen && networkType === "evm" && collateralAddresses.length > 0,
  );
  const { data: tokenPrices } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "UiHelper",
    functionName: "get_asset_prices",
    args: [[...collateralAddresses, position.tokenAddress]],
    query: { enabled: isOpen && networkType === "evm" && collateralAddresses.length > 0 },
  });

  // Build prices map when available
  useEffect(() => {
    if (!tokenPrices || networkType !== "evm") return;
    const prices = tokenPrices as unknown as bigint[];
    const addresses = [...collateralAddresses, position.tokenAddress];
    const map = prices.reduce((acc, price, idx) => {
      acc[addresses[idx]?.toLowerCase()] = price;
      return acc;
    }, {} as Record<string, bigint>);
    setTokenToPrices(map);
  }, [tokenPrices, collateralAddresses, position.tokenAddress, networkType]);

  // Normalize EVM collaterals into BasicCollateral
  useEffect(() => {
    if (networkType !== "evm") return;
    setIsLoadingCollaterals(evmIsLoadingCollats || isLoadingSupport);
    const normalized = evmCollaterals.map(c => ({
      address: c.address,
      symbol: c.symbol,
      icon: tokenNameToLogo(c.symbol.toLowerCase()),
      decimals: c.decimals,
      rawBalance: c.rawBalance,
      balance: c.balance,
      usdPrice: tokenToPrices?.[c.address.toLowerCase()],
    }));
    setCollaterals(normalized);
    setSupportedCollateralMap(supportedCollaterals);
  }, [evmCollaterals, evmIsLoadingCollats, isLoadingSupport, supportedCollaterals, tokenToPrices, networkType]);

  // Stark branch: collaterals (already include balance/decimals), no UiHelper prices
  const { collaterals: starkCollaterals, isLoading: starkIsLoading } = useStarkCollaterals({
    protocolName: (fromProtocol as any) as "Vesu" | "VesuV2" | "Nostra",
    userAddress: "", // stark user address handled inside hook's get_supported_assets_info call context if needed
    isOpen: isOpen && networkType === "starknet",
  });
  useEffect(() => {
    if (networkType !== "starknet") return;
    setIsLoadingCollaterals(starkIsLoading);
    const normalized = starkCollaterals.map(c => ({
      address: c.address,
      symbol: c.symbol,
      icon: tokenNameToLogo(c.symbol.toLowerCase()),
      decimals: c.decimals,
      rawBalance: c.rawBalance,
      balance: c.balance,
    }));
    setCollaterals(normalized);
    setSupportedCollateralMap(undefined);
    setTokenToPrices(undefined);
  }, [starkCollaterals, starkIsLoading, networkType]);

  // Flash loan providers
  const [flashLoanProviders, setFlashLoanProviders] = useState<FlashLoanProviderOption[]>([]);
  const [defaultFlashLoanProvider, setDefaultFlashLoanProvider] = useState<FlashLoanProviderOption | undefined>(undefined);
  // EVM router flags
  const { data: balancerV2Enabled, isLoading: isLoadingBalancerV2 } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "KapanRouter",
    functionName: "balancerV2Enabled",
    query: { enabled: isOpen && networkType === "evm" },
  });
  const { data: balancerV3Enabled, isLoading: isLoadingBalancerV3 } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "KapanRouter",
    functionName: "balancerV3Enabled",
    query: { enabled: isOpen && networkType === "evm" },
  });
  const { data: aaveEnabled, isLoading: isLoadingAave } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "KapanRouter",
    functionName: "aaveEnabled",
    query: { enabled: isOpen && networkType === "evm" },
  });
  useEffect(() => {
    if (networkType !== "evm") {
      // Stark: show placeholder Vesu flash loan provider (matches current stark modal)
      const starkProvider: FlashLoanProviderOption = { name: "Vesu", version: "v1", icon: "/logos/vesu.svg" };
      setFlashLoanProviders([starkProvider]);
      setDefaultFlashLoanProvider(starkProvider);
      return;
    }
    if (isLoadingBalancerV2 || isLoadingBalancerV3 || isLoadingAave) return;
    const providers: FlashLoanProviderOption[] = [];
    if (balancerV2Enabled === true && chainId && BALANCER_CHAINS.includes(chainId)) {
      providers.push({ name: "Balancer V2", icon: "/logos/balancer.svg", version: "v2", providerEnum: 0 });
    }
    if (balancerV3Enabled === true && chainId && BALANCER_CHAINS.includes(chainId)) {
      providers.push({ name: "Balancer V3", icon: "/logos/balancer.svg", version: "v3", providerEnum: 1 });
    }
    if (aaveEnabled === true && chainId && AAVE_CHAINS.includes(chainId)) {
      providers.push({ name: "Aave V3", icon: "/logos/aave.svg", version: "aave", providerEnum: 2 });
    }
    setFlashLoanProviders(providers);
    setDefaultFlashLoanProvider(providers[0]);
  }, [
    networkType,
    isLoadingBalancerV2,
    isLoadingBalancerV3,
    isLoadingAave,
    balancerV2Enabled,
    balancerV3Enabled,
    aaveEnabled,
    chainId,
  ]);

  // Vesu pools (for Stark UI that requires versions/pools)
  const vesuPools: VesuPoolsData | undefined = useMemo(() => {
    if (networkType !== "starknet") return undefined;
    const v1Pools = Object.entries(VESU_V1_POOLS).map(([name, id]) => ({ name: name as keyof typeof VESU_V1_POOLS, id }));
    const v2Pools = Object.entries(VESU_V2_POOLS).map(([name, address]) => ({
      name: name as keyof typeof VESU_V2_POOLS,
      address,
    }));
    return { v1Pools, v2Pools };
  }, [networkType]);

  return {
    debtSymbol,
    debtIcon,
    debtMaxRaw,
    debtMaxLabel,
    sourceProtocol,
    collaterals,
    isLoadingCollaterals,
    supportedCollateralMap,
    tokenToPrices,
    destinationProtocols,
    flashLoanProviders,
    defaultFlashLoanProvider,
    vesuPools,
  };
}



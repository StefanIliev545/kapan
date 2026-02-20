import { useEffect, useMemo, useState, useRef } from "react";
import { useAccount as useEvmAccount } from "wagmi";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { useCollaterals as useEvmCollaterals } from "~~/hooks/scaffold-eth/useCollaterals";
import { useCollateralSupport as useEvmCollateralSupport } from "~~/hooks/scaffold-eth/useCollateralSupport";
import { useCollateral as useStarkCollaterals } from "~~/hooks/scaffold-stark/useCollateral";
import { getProtocolLogo } from "~~/utils/protocol";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { VESU_V1_POOLS, VESU_V2_POOLS } from "~~/components/specific/vesu/pools";
import { formatUnits } from "viem";

// Helper function to safely stringify objects containing BigInt values
const stringifyWithBigInt = (value: unknown): string => {
  return JSON.stringify(value, (_key, val) => (typeof val === "bigint" ? val.toString() : val));
};

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

// Re-export FlashLoanProviderOption from the centralized flashLoan utils
export type { FlashLoanProviderOption } from "~~/utils/flashLoan";

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

import { isVenusSupported, isMorphoBlueSupported, isSparkSupported, isEulerSupported } from "~~/utils/chainFeatures";
import { getAvailableFlashLoanProviders, FlashLoanProvider, type FlashLoanProviderOption } from "~~/utils/flashLoan";

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
    } catch { }
    return { debtMaxRaw: undefined, debtMaxLabel: undefined };
  }, [position.balance, position.decimals]);

  // Destination protocol options - built from static chain config
  // IMPORTANT: Keep in sync with packages/hardhat/deploy/v2/ gateway deploy scripts
  const destinationProtocols: DestinationProtocolOption[] = useMemo(() => {
    if (networkType === "evm") {
      const protocols: DestinationProtocolOption[] = [
        // Always available on all EVM chains
        { name: "Aave V3", logo: getProtocolLogo("Aave V3") },
        { name: "Compound V3", logo: getProtocolLogo("Compound V3") },
      ];

      // Add chain-specific protocols
      if (isSparkSupported(chainId)) {
        protocols.push({ name: "Spark", logo: getProtocolLogo("Spark") });
      }
      if (isMorphoBlueSupported(chainId)) {
        protocols.push({ name: "Morpho Blue", logo: getProtocolLogo("Morpho Blue") });
      }
      if (isVenusSupported(chainId)) {
        protocols.push({ name: "Venus", logo: getProtocolLogo("Venus") });
      }
      if (isEulerSupported(chainId)) {
        protocols.push({ name: "Euler V2", logo: getProtocolLogo("Euler V2") });
      }

      return protocols.filter(
        p => p.name.toLowerCase() !== fromProtocol.toLowerCase(),
      );
    }
    // Starknet: Vesu, VesuV2, Nostra
    // Note: Vesu/VesuV2 are always included as destinations (even when source is Vesu)
    // because moving from Vesu V1 to Vesu V1 (different pool) is a valid move
    return [{ name: "Vesu", logo: getProtocolLogo("Vesu") }, { name: "VesuV2", logo: getProtocolLogo("VesuV2") }, { name: "Nostra", logo: getProtocolLogo("Nostra") }].filter(
      // Only filter out Nostra if source is Nostra (Vesu/VesuV2 can always be destinations)
      p => !(p.name.toLowerCase() === "nostra" && fromProtocol.toLowerCase() === "nostra"),
    );
  }, [fromProtocol, networkType, chainId]);

  // Collaterals and support
  const [collaterals, setCollaterals] = useState<BasicCollateral[]>([]);
  const [isLoadingCollaterals, setIsLoadingCollaterals] = useState(false);
  const [supportedCollateralMap, setSupportedCollateralMap] = useState<Record<string, boolean> | undefined>(undefined);

  // EVM branch: collaterals, support, prices, flash loan provider detection
  const { collaterals: evmCollaterals, isLoading: evmIsLoadingCollats } = useEvmCollaterals(
    position.tokenAddress,
    fromProtocol,
    (evmUserAddress as string) || zeroAddress,
    isOpen && networkType === "evm",
    chainId,
  );


  const { isLoading: isLoadingSupport, supportedCollaterals } = useEvmCollateralSupport(
    destinationProtocols[0]?.name || "",
    position.tokenAddress,
    useMemo(() => evmCollaterals.map(c => c.address), [evmCollaterals]),
    isOpen && networkType === "evm" && evmCollaterals.length > 0,
    chainId,
  );

  const { data: tokenPrices } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "UiHelper",
    functionName: "get_asset_prices",
    args: [useMemo(() => [...evmCollaterals.map(c => c.address), position.tokenAddress], [evmCollaterals, position.tokenAddress])],
    query: { enabled: isOpen && networkType === "evm" && evmCollaterals.length > 0 },
  });

  // Prices map (EVM UiHelper 1e8 decimals) - computed with useMemo
  const tokenToPrices = useMemo(() => {
    if (!tokenPrices || networkType !== "evm") return undefined;
    const prices = tokenPrices as unknown as bigint[];
    const addresses = [...evmCollaterals.map(c => c.address), position.tokenAddress];
    return prices.reduce((acc, price, idx) => {
      acc[addresses[idx]?.toLowerCase()] = price;
      return acc;
    }, {} as Record<string, bigint>);
  }, [tokenPrices, evmCollaterals, position.tokenAddress, networkType]);

  // Use ref to track previous values and avoid infinite loops
  const prevEvmDataRef = useRef<{
    evmCollaterals: string;
    supportedCollaterals: string;
    tokenToPrices: string;
  }>({ evmCollaterals: '', supportedCollaterals: '', tokenToPrices: '' });

  // Track previous loading state to avoid unnecessary updates that cause re-renders
  const prevEvmLoadingRef = useRef<boolean | null>(null);

  // Separate effect for EVM loading state - only updates when loading actually changes
  useEffect(() => {
    if (networkType !== "evm") return;

    const currentLoading = evmIsLoadingCollats || isLoadingSupport;
    if (prevEvmLoadingRef.current !== currentLoading) {
      prevEvmLoadingRef.current = currentLoading;
      setIsLoadingCollaterals(currentLoading);
    }
  }, [networkType, evmIsLoadingCollats, isLoadingSupport]);

  // Normalize EVM collaterals into BasicCollateral - data only effect
  useEffect(() => {
    if (networkType !== "evm") return;

    const currentEvmCollaterals = stringifyWithBigInt(evmCollaterals);
    const currentSupportedCollaterals = stringifyWithBigInt(supportedCollaterals);
    const currentTokenToPrices = stringifyWithBigInt(tokenToPrices);

    // Only update collaterals/support if data actually changed (to avoid re-renders)
    if (
      prevEvmDataRef.current.evmCollaterals === currentEvmCollaterals &&
      prevEvmDataRef.current.supportedCollaterals === currentSupportedCollaterals &&
      prevEvmDataRef.current.tokenToPrices === currentTokenToPrices
    ) {
      return;
    }

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

    // Update ref with current values
    prevEvmDataRef.current = {
      evmCollaterals: currentEvmCollaterals,
      supportedCollaterals: currentSupportedCollaterals,
      tokenToPrices: currentTokenToPrices,
    };
  }, [
    networkType,
    evmCollaterals,
    supportedCollaterals,
    tokenToPrices,
  ]);

  // Stark branch: collaterals
  // Call hook unconditionally to satisfy React's rules of hooks
  const starkCollateralsData = useStarkCollaterals({
    protocolName: (networkType === "starknet" ? fromProtocol : "Vesu") as "Vesu" | "VesuV2" | "Nostra",
    userAddress: "",
    isOpen: networkType === "starknet" && isOpen,
  });

  const { collaterals: starkCollaterals, isLoading: starkIsLoading } = networkType === "starknet"
    ? starkCollateralsData
    : { collaterals: [], isLoading: false };

  // Use ref for Stark data too
  const prevStarkDataRef = useRef<{
    starkCollaterals: string;
  }>({ starkCollaterals: '' });

  useEffect(() => {
    if (networkType !== "starknet") return;

    const currentStarkCollaterals = stringifyWithBigInt(starkCollaterals);
    if (prevStarkDataRef.current.starkCollaterals === currentStarkCollaterals) {
      return;
    }

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

    prevStarkDataRef.current.starkCollaterals = currentStarkCollaterals;
  }, [starkCollaterals, starkIsLoading, networkType]);

  // Flash loan providers - built from static chain config (no contract reads needed)
  // Uses centralized getAvailableFlashLoanProviders() to avoid duplication
  const flashLoanProviders = useMemo<FlashLoanProviderOption[]>(() => {
    if (networkType !== "evm") {
      // Stark: show placeholder Vesu flash loan provider
      // Note: Vesu flash loans use a different mechanism, not the FlashLoanProvider enum
      const starkProvider: FlashLoanProviderOption = {
        name: "Vesu",
        version: "v1",
        icon: "/logos/vesu.svg",
        providerEnum: FlashLoanProvider.BalancerV2, // Placeholder value, not used for Starknet
        feeBps: 0,
      };
      return [starkProvider];
    }

    return getAvailableFlashLoanProviders(chainId);
  }, [networkType, chainId]);

  const defaultFlashLoanProvider = useMemo(() => flashLoanProviders[0], [flashLoanProviders]);

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

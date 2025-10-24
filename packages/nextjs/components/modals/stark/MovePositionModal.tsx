import { FC, useCallback, useEffect, useMemo, useState, useRef } from "react";
import Image from "next/image";
import { useAccount } from "~~/hooks/useAccount";
import { useProvider, useReadContract } from "@starknet-react/core";
import { FiAlertTriangle, FiCheck, FiLock } from "react-icons/fi";
import { FaGasPump } from "react-icons/fa";
import { CairoCustomEnum, CairoOption, CairoOptionVariant, CallData, num, uint256 } from "starknet";
import { useGasEstimate } from "~~/hooks/useGasEstimate";
import { formatUnits, parseUnits } from "viem";
import { CollateralSelector, CollateralWithAmount } from "~~/components/specific/collateral/CollateralSelector";
import { CollateralAmounts } from "~~/components/specific/collateral/CollateralAmounts";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { ERC20ABI } from "~~/contracts/externalContracts";
import { useCollateralSupport } from "~~/hooks/scaffold-eth/useCollateralSupport";
import { useCollaterals } from "~~/hooks/scaffold-eth/useCollaterals";
import { useVesuAssets } from "~~/hooks/useVesuAssets";
import { useVesuV2Assets } from "~~/hooks/useVesuV2Assets";
import {
  useDeployedContractInfo,
  useScaffoldMultiWriteContract,
  useScaffoldReadContract,
} from "~~/hooks/scaffold-stark";
import { useCollateral } from "~~/hooks/scaffold-stark/useCollateral";
import { getProtocolLogo } from "~~/utils/protocol";
import { feltToString } from "~~/utils/protocols";
import { VESU_V1_POOLS, VESU_V2_POOLS, getV1PoolNameFromId, getV2PoolNameFromAddress } from "../../specific/vesu/pools";
import { useLendingAuthorizations, type LendingAuthorization } from "~~/hooks/useLendingAuthorizations";
import { buildModifyDelegationRevokeCalls } from "~~/utils/authorizations";
import { normalizeStarknetAddress } from "~~/utils/vesu";
import { useSwapQuote, type SwapQuoteStatus } from "~~/hooks/useSwapQuote";
import type { AvnuQuote } from "~~/lib/swaps/avnu";
import { getVTokenForAsset } from "~~/lib/vesu";

// Format number with thousands separators for display
const formatDisplayNumber = (value: string | number) => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(num);
};

// Define the step type for tracking the move flow
type MoveStep = "idle" | "executing" | "done";

// Use centralized pools from pools.ts

type OutputPointer = { instruction_index: bigint; output_index: bigint };

const toOutputPointer = (instructionIndex: number, outputIndex = 0): OutputPointer => ({
  instruction_index: BigInt(instructionIndex),
  output_index: BigInt(outputIndex),
});

type TargetCollateralOption = {
  address: string;
  symbol: string;
  decimals: number;
};

type CollateralSwapPlan = {
  target: TargetCollateralOption;
  status: SwapQuoteStatus;
  quote: AvnuQuote | null;
  error: string | null;
};

const SWAP_SLIPPAGE_BPS = 500n;
const MAX_APPROVAL_AMOUNT = (1n << 256n) - 1n;

const resolveSwapOutputIndex = (entrypoint?: string) => {
  const normalized = entrypoint?.toLowerCase() ?? "";

  if (normalized === "swap_exact_token_to") {
    return 0;
  }

  return 1;
};

const toSymbolString = (value: unknown, address: string) => {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "bigint") {
    const resolved = feltToString(value);
    if (resolved && resolved.length > 0) {
      return resolved;
    }
  }
  return address;
};

interface MovePositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromProtocol: "Nostra" | "Vesu" | "VesuV2";
  position: {
    name: string;
    balance: bigint; // USD value (display only)
    type: "supply" | "borrow";
    tokenAddress: string;
    decimals: number; // Add decimals for proper amount parsing
    poolId?: bigint; // Add current pool ID
  };
  preSelectedCollaterals?: CollateralWithAmount[];
  disableCollateralSelection?: boolean;
}

type VesuContextV1 = {
  pool_id: bigint;
  counterpart_token: string;
};

type VesuContextV2 = {
  pool_address: string;
  position_counterpart_token: string;
};

type FlashLoanProvider = {
  name: "Vesu";
  icon: string;
  version: "v1";
};

const FLASH_LOAN_PROVIDER: FlashLoanProvider = {
  name: "Vesu",
  icon: "/logos/vesu.svg",
  version: "v1",
} as const;

// V2 pool selection handled via VESU_V2_POOLS

export const MovePositionModal: FC<MovePositionModalProps> = ({
  isOpen,
  onClose,
  fromProtocol,
  position,
  preSelectedCollaterals,
  disableCollateralSelection,
}) => {
  const { address: userAddress, chainId } = useAccount();
  const { provider } = useProvider();
  const protocols = useMemo(() => [{ name: "Nostra" }, { name: "Vesu" }, { name: "VesuV2" }], []);
  const { tokenAddress, decimals, type, name, balance, poolId: currentPoolId } = position;

  const [selectedProtocol, setSelectedProtocol] = useState(
    () => protocols.find(p => p.name !== fromProtocol)?.name || "",
  );
  const [selectedPoolId, setSelectedPoolId] = useState<bigint>(VESU_V1_POOLS["Genesis"]);
  const [selectedV2PoolAddress, setSelectedV2PoolAddress] = useState<string>(VESU_V2_POOLS["Default"]);
  const [amount, setAmount] = useState("");
  const [isAmountMaxClicked, setIsAmountMaxClicked] = useState(false);
  const amountRef = useRef("");

  const normalizedCurrentV2PoolAddress = useMemo(() => {
    if (fromProtocol !== "VesuV2" || currentPoolId === undefined) {
      return undefined;
    }

    try {
      return normalizeStarknetAddress(currentPoolId);
    } catch (error) {
      console.error("Failed to normalize current V2 pool address", error);
      return undefined;
    }
  }, [fromProtocol, currentPoolId]);
  
  // Preserve amount value across re-renders caused by collateral data changes
  useEffect(() => {
    if (amount) {
      amountRef.current = amount;
    }
  }, [amount]);
  
  // Restore amount from ref if it gets reset unexpectedly
  useEffect(() => {
    if (!amount && amountRef.current && isOpen) {
      setAmount(amountRef.current);
    }
  }, [isOpen, amount]);
  const [selectedCollateralsWithAmounts, setSelectedCollateralsWithAmounts] =
    useState<CollateralWithAmount[]>([]);
  const [maxClickedCollaterals, setMaxClickedCollaterals] = useState<Record<string, boolean>>({});
  const [collateralSwapSelections, setCollateralSwapSelections] = useState<Record<string, TargetCollateralOption | null>>({});
  const [collateralSwapPlans, setCollateralSwapPlans] = useState<Record<string, CollateralSwapPlan>>({});
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<MoveStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const { data: routerGateway } = useDeployedContractInfo("RouterGateway");
  const { getAuthorizations, isReady: isAuthReady } = useLendingAuthorizations();
  const [fetchedAuthorizations, setFetchedAuthorizations] = useState<LendingAuthorization[]>([]);
  const [swapApprovalSpenders, setSwapApprovalSpenders] = useState<Record<string, string>>({});

  const { collaterals: sourceCollaterals, isLoading: isLoadingSourceCollaterals } = useCollateral({
    protocolName: fromProtocol as "Vesu" | "VesuV2" | "Nostra",
    userAddress: userAddress || "0x0000000000000000000000000000000000000000",
    isOpen: isOpen && !(disableCollateralSelection && preSelectedCollaterals && fromProtocol === "Vesu"),
  });

  const { collaterals: targetCollaterals, isLoading: isLoadingTargetCollaterals } = useCollateral({
    protocolName: selectedProtocol as "Vesu" | "VesuV2" | "Nostra",
    userAddress: userAddress || "0x0000000000000000000000000000000000000000",
    isOpen: isOpen && !!selectedProtocol,
  });

  const {
    collateralSet: vesuCollateralSet,
    assetMap: vesuAssetMap,
    isLoading: isLoadingVesuAssets,
  } = useVesuAssets(selectedPoolId);

  const {
    collateralSet: vesuV2CollateralSet,
    assetMap: vesuV2AssetMap,
    isLoading: isLoadingVesuV2Assets,
  } = useVesuV2Assets(selectedV2PoolAddress);

  // Track first load completion (never reset) to avoid spinner after initial data is shown
  const firstCollateralsReadyRef = useRef(false);
  useEffect(() => {
    if (
      (disableCollateralSelection && preSelectedCollaterals && (fromProtocol === "Vesu" || fromProtocol === "VesuV2")) ||
      (!isLoadingSourceCollaterals && !isLoadingTargetCollaterals)
    ) {
      firstCollateralsReadyRef.current = true;
    }
  }, [
    disableCollateralSelection,
    preSelectedCollaterals,
    fromProtocol,
    isLoadingSourceCollaterals,
    isLoadingTargetCollaterals,
  ]);

  const targetProtocolKey = useMemo(() => {
    if (!selectedProtocol) return null;
    return selectedProtocol === "VesuV2" ? "vesu_v2" : selectedProtocol.toLowerCase();
  }, [selectedProtocol]);

  const targetMarketAddress = useMemo(() => {
    if (!selectedProtocol) return null;
    if (selectedProtocol === "Vesu") {
      return normalizeStarknetAddress(selectedPoolId);
    }
    if (selectedProtocol === "VesuV2") {
      return normalizeStarknetAddress(selectedV2PoolAddress);
    }
    return position.tokenAddress;
  }, [selectedProtocol, selectedPoolId, selectedV2PoolAddress, position.tokenAddress]);

  const collateralAddressesForSupport = useMemo(() => {
    const addresses = new Set<string>();

    sourceCollaterals.forEach(collateral => addresses.add(collateral.address.toLowerCase()));
    targetCollaterals.forEach(collateral => addresses.add(collateral.address.toLowerCase()));
    selectedCollateralsWithAmounts.forEach(collateral => addresses.add(collateral.token.toLowerCase()));
    preSelectedCollaterals?.forEach(collateral => addresses.add(collateral.token.toLowerCase()));

    return Array.from(addresses);
  }, [
    sourceCollaterals,
    targetCollaterals,
    selectedCollateralsWithAmounts,
    preSelectedCollaterals,
  ]);

  const supportQueryEnabled =
    isOpen &&
    !!targetProtocolKey &&
    !!targetMarketAddress &&
    collateralAddressesForSupport.length > 0;

  const { isLoading: isLoadingCollateralSupport, supportedCollaterals: rawSupportedCollaterals } =
    useCollateralSupport(
      targetProtocolKey ?? "",
      targetMarketAddress ?? "0x0",
      collateralAddressesForSupport,
      supportQueryEnabled,
    );

  const targetSupportedCollateralSet = useMemo(() => {
    if (selectedProtocol === "Vesu") {
      return vesuCollateralSet;
    }
    if (selectedProtocol === "VesuV2") {
      return vesuV2CollateralSet;
    }
    return null;
  }, [selectedProtocol, vesuCollateralSet, vesuV2CollateralSet]);

  const targetSupportedCollateralSetNormalized = useMemo(() => {
    if (!targetSupportedCollateralSet) return null;
    const normalized = new Set<string>();
    targetSupportedCollateralSet.forEach(address => normalized.add(address.toLowerCase()));
    return normalized;
  }, [targetSupportedCollateralSet]);

  const isDeterministicCompatibilityLoading = useMemo(() => {
    if (selectedProtocol === "Vesu") {
      return isLoadingVesuAssets;
    }
    if (selectedProtocol === "VesuV2") {
      return isLoadingVesuV2Assets;
    }
    return false;
  }, [selectedProtocol, isLoadingVesuAssets, isLoadingVesuV2Assets]);

  const fallbackSupportedCollateralsMap = useMemo(() => {
    const entries = Object.entries(rawSupportedCollaterals ?? {});
    if (entries.length === 0) return {} as Record<string, boolean>;
    return entries.reduce(
      (acc, [address, supported]) => {
        acc[address.toLowerCase()] = supported;
        return acc;
      },
      {} as Record<string, boolean>,
    );
  }, [rawSupportedCollaterals]);

  const deterministicSupportedCollateralsMap = useMemo(() => {
    if (!targetSupportedCollateralSetNormalized || isDeterministicCompatibilityLoading) return null;
    const map: Record<string, boolean> = {};
    collateralAddressesForSupport.forEach(address => {
      const normalized = address.toLowerCase();
      map[normalized] = targetSupportedCollateralSetNormalized.has(normalized);
    });
    return map;
  }, [
    collateralAddressesForSupport,
    isDeterministicCompatibilityLoading,
    targetSupportedCollateralSetNormalized,
  ]);

  const supportedCollateralsMap = useMemo(() => {
    if (deterministicSupportedCollateralsMap) {
      return deterministicSupportedCollateralsMap;
    }
    return fallbackSupportedCollateralsMap;
  }, [deterministicSupportedCollateralsMap, fallbackSupportedCollateralsMap]);

  const hasSupportResults = useMemo(() => {
    if (targetSupportedCollateralSetNormalized && !isDeterministicCompatibilityLoading) return true;
    return Object.keys(fallbackSupportedCollateralsMap).length > 0;
  }, [
    fallbackSupportedCollateralsMap,
    isDeterministicCompatibilityLoading,
    targetSupportedCollateralSetNormalized,
  ]);

  const isCompatibilityLoading = isLoadingCollateralSupport || isDeterministicCompatibilityLoading;

  const collateralsForSelector = useMemo(() => {
    const resolveSupport = (address: string) => {
      const normalized = address.toLowerCase();
      const support = supportedCollateralsMap[normalized];
      if (support !== undefined) return support;
      return !hasSupportResults;
    };

    if (disableCollateralSelection && preSelectedCollaterals && (fromProtocol === "Vesu" || fromProtocol === "VesuV2")) {
      return preSelectedCollaterals.map(collateral => ({
        symbol: collateral.symbol,
        balance: Number(collateral.inputValue || collateral.amount.toString()),
        address: collateral.token,
        decimals: collateral.decimals,
        rawBalance: collateral.amount,
        supported: resolveSupport(collateral.token),
      }));
    }

    let filtered = sourceCollaterals.filter(c => c.balance > 0);
    if (fromProtocol === "Nostra" && (selectedProtocol === "Vesu" || selectedProtocol === "VesuV2") && type === "borrow") {
      filtered = filtered.filter(c => c.address.toLowerCase() !== tokenAddress.toLowerCase());
    }

    return filtered.map(collateral => ({
      ...collateral,
      supported: resolveSupport(collateral.address),
    }));
  }, [
    sourceCollaterals,
    preSelectedCollaterals,
    disableCollateralSelection,
    fromProtocol,
    selectedProtocol,
    type,
    tokenAddress,
    supportedCollateralsMap,
    hasSupportResults,
  ]);

  const vesuSupportedCollateralMap = useMemo(() => {
    const map = new Map<string, TargetCollateralOption>();
    vesuAssetMap.forEach((asset, address) => {
      const normalized = address.toLowerCase();
      const symbol = toSymbolString((asset as any)?.symbol, address);
      const decimals = typeof asset.decimals === "number" ? asset.decimals : 18;
      map.set(normalized, {
        address,
        symbol,
        decimals,
      });
    });
    return map;
  }, [vesuAssetMap]);

  const vesuV2SupportedCollateralMap = useMemo(() => {
    const map = new Map<string, TargetCollateralOption>();
    vesuV2AssetMap.forEach((asset, address) => {
      const normalized = address.toLowerCase();
      const symbol = toSymbolString((asset as any)?.symbol, address);
      const decimals = typeof asset.decimals === "number" ? asset.decimals : 18;
      map.set(normalized, {
        address,
        symbol,
        decimals,
      });
    });
    return map;
  }, [vesuV2AssetMap]);

  const poolSupportedTargetCollaterals = useMemo(() => {
    if (targetSupportedCollateralSet && targetSupportedCollateralSetNormalized) {
      const lookup =
        selectedProtocol === "Vesu"
          ? vesuSupportedCollateralMap
          : selectedProtocol === "VesuV2"
            ? vesuV2SupportedCollateralMap
            : null;

      const options: TargetCollateralOption[] = [];
      targetSupportedCollateralSet.forEach(address => {
        const normalized = address.toLowerCase();
        const metadata = lookup?.get(normalized);
        if (metadata) {
          options.push({ ...metadata });
          return;
        }

        const fallback = targetCollaterals.find(token => token.address.toLowerCase() === normalized);
        if (fallback) {
          options.push({
            address: fallback.address,
            symbol: fallback.symbol,
            decimals: fallback.decimals,
          });
          return;
        }

        options.push({
          address,
          symbol: address,
          decimals: 18,
        });
      });

      return options.sort((a, b) => a.symbol.localeCompare(b.symbol));
    }

    if (!hasSupportResults) {
      return targetCollaterals.map(collateral => ({
        address: collateral.address,
        symbol: collateral.symbol,
        decimals: collateral.decimals,
      }));
    }

    return targetCollaterals
      .filter(token => {
        const normalized = token.address.toLowerCase();
        const support = supportedCollateralsMap[normalized];
        return support !== false;
      })
      .map(token => ({
        address: token.address,
        symbol: token.symbol,
        decimals: token.decimals,
      }));
  }, [
    targetSupportedCollateralSet,
    targetSupportedCollateralSetNormalized,
    selectedProtocol,
    vesuSupportedCollateralMap,
    vesuV2SupportedCollateralMap,
    targetCollaterals,
    hasSupportResults,
    supportedCollateralsMap,
  ]);

  const { data: tokenPrices } = useScaffoldReadContract({
    contractName: "UiHelper",
    functionName: "get_asset_prices",
    args: [[...collateralsForSelector.map(c => c.address), tokenAddress]],
    refetchInterval: 30000, // Reduced from 5s to 30s
    enabled: !!collateralsForSelector.length && isOpen,
  });

  useEffect(() => {
    if (!isOpen) return;

    setSelectedCollateralsWithAmounts(prev => {
      if (prev.length === 0) return prev;

      let changed = false;
      const updated = prev.map(collateral => {
        const normalized = collateral.token.toLowerCase();
        const support = supportedCollateralsMap[normalized];
        const resolvedSupport = support !== undefined ? support : !hasSupportResults;

        if (collateral.supported !== resolvedSupport) {
          changed = true;
          return { ...collateral, supported: resolvedSupport };
        }

        return collateral;
      });

      return changed ? updated : prev;
    });
  }, [hasSupportResults, isOpen, supportedCollateralsMap]);

  // Once compatibility data resolves, synchronise the stored selections so
  // unsupported collaterals immediately surface in the UI. This effect keeps the
  // `supported` flag in sync with the current target pool allow list so the
  // incompatibility banner renders deterministically instead of relying on user
  // interaction to refresh the state.
  useEffect(() => {
    if (!hasSupportResults) return;

    const compatibleSet = new Set(
      poolSupportedTargetCollaterals.map(option => option.address.toLowerCase()),
    );

    setSelectedCollateralsWithAmounts(prev => {
      let changed = false;
      const next = prev.map(collateral => {
        const normalized = collateral.token.toLowerCase();
        const isSupported = compatibleSet.has(normalized);
        if (collateral.supported === isSupported) {
          return collateral;
        }

        changed = true;
        return { ...collateral, supported: isSupported };
      });

      return changed ? next : prev;
    });
  }, [hasSupportResults, poolSupportedTargetCollaterals]);

  const { tokenToPrices } = useMemo(() => {
    if (!tokenPrices) return { tokenToPrices: {} };
    const prices = tokenPrices as unknown as bigint[];
    const addresses = [...collateralsForSelector.map(c => c.address), tokenAddress];
    return {
      tokenToPrices: prices.reduce(
        (acc, price, index) => ({
          ...acc,
          [addresses[index]]: price / 10n ** 10n,
        }),
        {} as Record<string, bigint>,
      ),
    };
  }, [tokenPrices, collateralsForSelector, tokenAddress]);

  const debtUsdValue = useMemo(() => {
    if (!amount) return 0;
    const price = tokenToPrices[tokenAddress.toLowerCase()];
    const usdPerToken = price ? Number(formatUnits(price, 8)) : 0;
    return parseFloat(amount) * usdPerToken;
  }, [amount, tokenToPrices, tokenAddress]);

  const totalCollateralUsd = useMemo(
    () =>
      selectedCollateralsWithAmounts.reduce((sum, c) => {
        const price = tokenToPrices[c.token.toLowerCase()];
        const normalized = Number(formatUnits(c.amount, c.decimals));
        const usd = price ? normalized * Number(formatUnits(price, 8)) : 0;
        return sum + usd;
      }, 0),
    [selectedCollateralsWithAmounts, tokenToPrices],
  );

  const swapBlocking = useMemo(() => {
    return selectedCollateralsWithAmounts.some(collateral => {
      if (collateral.supported || collateral.amount === 0n) {
        return false;
      }
      const selection = collateralSwapSelections[collateral.token];
      const plan = collateralSwapPlans[collateral.token];
      if (!selection) return true;
      if (!plan) return true;
      if (plan.error) return true;
      if (!plan.quote || plan.quote.calldata.length === 0) return true;
      return false;
    });
  }, [selectedCollateralsWithAmounts, collateralSwapSelections, collateralSwapPlans]);

  const swapLoading = useMemo(
    () =>
      selectedCollateralsWithAmounts.some(
        collateral => {
          if (collateral.supported || collateral.amount === 0n) {
            return false;
          }
          const plan = collateralSwapPlans[collateral.token];
          return plan ? plan.status === "loading" && !plan.quote : false;
        },
      ),
    [selectedCollateralsWithAmounts, collateralSwapPlans],
  );

  const incompatibleCollaterals = useMemo(
    () => selectedCollateralsWithAmounts.filter(collateral => !collateral.supported),
    [selectedCollateralsWithAmounts],
  );

  // Spinner only before first successful data render
  const isLoadingCollaterals =
    !firstCollateralsReadyRef.current &&
    (isLoadingSourceCollaterals || isLoadingTargetCollaterals || isCompatibilityLoading);
  // Construct instruction based on current state
  const { fullInstruction, authInstruction, authInstructions, authCalldataKey, pairInstructions } = useMemo(() => {
    if (!amount || !userAddress || !routerGateway?.address)
      return { fullInstruction: { instructions: [] }, authInstruction: { instructions: [] }, authInstructions: [], authCalldataKey: "", pairInstructions: [] };

    const tokenDecimals = position.decimals ?? 18; // Use position decimals if available, otherwise default to 18
    const parsedAmount = parseUnits(amount, tokenDecimals);
    const lowerProtocolName = fromProtocol === "VesuV2" ? "vesu_v2" : fromProtocol.toLowerCase();
    const destProtocolName = selectedProtocol === "VesuV2" ? "vesu_v2" : selectedProtocol.toLowerCase();

    if (swapBlocking) {
      return {
        fullInstruction: { instructions: [] },
        authInstruction: { instructions: [] },
        authInstructions: [],
        authCalldataKey: "",
        pairInstructions: [],
      };
    }

    // Calculate proportions for multiple collaterals
    if (selectedCollateralsWithAmounts.length > 1) {
      // Calculate USD values for each collateral using actual token prices from tokenToPrices
      const collateralUsdValues = selectedCollateralsWithAmounts.map(collateral => {
        // Convert BigInt amount to a normalized value based on decimals
        const tokenDecimals = collateral.decimals || 18;
        const normalizedAmount = Number(formatUnits(collateral.amount, tokenDecimals));

        // Get token price from tokenToPrices
        const tokenPrice = tokenToPrices[collateral.token.toLowerCase()];

        // Calculate actual USD value using price if available
        let usdValue = normalizedAmount; // Fallback to normalized amount
        if (tokenPrice) {
          // According to the implementation, tokenPrice is already normalized (divided by 10^10)
          usdValue = normalizedAmount * Number(formatUnits(tokenPrice, 8));
        }

        return {
          token: collateral.token,
          symbol: collateral.symbol,
          amount: collateral.amount,
          decimals: tokenDecimals,
          price: tokenPrice || 0n,
          usdValue: usdValue,
        };
      });

      // Calculate total USD value
      const totalUsdValue = collateralUsdValues.reduce((sum, collateral) => sum + collateral.usdValue, 0);

      // Store original debt amount
      const totalDebtAmount = parsedAmount;

      // Calculate proportion for each collateral based on USD values
      const proportions = collateralUsdValues.map(collateral => {
        // Calculate proportion with high precision (as basis points - 1/10000)
        const proportionBps = totalUsdValue > 0 ? Math.floor((collateral.usdValue / totalUsdValue) * 10000) : 0;

        // Calculate debt amount for this collateral based on proportion
        const debtAmountForCollateral =
          totalUsdValue > 0 ? (totalDebtAmount * BigInt(proportionBps)) / BigInt(10000) : 0n;

        return {
          token: collateral.token,
          symbol: collateral.symbol,
          proportionBps,
          proportion: proportionBps / 10000,
          priceUsd: collateral.price ? Number(formatUnits(collateral.price, 8)) : 0,
          usdValue: collateral.usdValue,
          debtAmount: debtAmountForCollateral,
          debtAmountFormatted: formatUnits(debtAmountForCollateral, tokenDecimals),
        };
      });

      // Ensure we allocate 100% of the debt by assigning any remainder to the first collateral
      const allocatedDebtSum = proportions.reduce((sum, p) => sum + p.debtAmount, 0n);
      const remainder = parsedAmount - allocatedDebtSum;

      if (remainder > 0 && proportions.length > 0) {
        proportions[0].debtAmount += remainder;
        proportions[0].debtAmountFormatted = formatUnits(proportions[0].debtAmount, tokenDecimals);
      }
    }

    // Function to generate Vesu instructions with proportional debt allocation
    const generateVesuInstructions = () => {
      // Only generate proportional instructions if we have multiple collaterals
      if (selectedCollateralsWithAmounts.length <= 1) {
        return null;
      }

      // Calculate USD values and proportions for each collateral
      const collateralUsdValues = selectedCollateralsWithAmounts.map(collateral => {
        const tokenDecimals = collateral.decimals || 18;
        const normalizedAmount = Number(formatUnits(collateral.amount, tokenDecimals));
        const tokenPrice = tokenToPrices[collateral.token.toLowerCase()];

        let usdValue = normalizedAmount;
        if (tokenPrice) {
          usdValue = normalizedAmount * Number(formatUnits(tokenPrice, 8));
        }

        return {
          token: collateral.token,
          amount: collateral.amount,
          decimals: tokenDecimals,
          usdValue,
        };
      });

      const totalUsdValue = collateralUsdValues.reduce((sum, c) => sum + c.usdValue, 0);

      // Calculate debt allocation based on proportions
      const debtAllocations = collateralUsdValues.map(collateral => {
        const proportionBps = totalUsdValue > 0 ? Math.floor((collateral.usdValue / totalUsdValue) * 10000) : 0;

        return {
          token: collateral.token,
          proportionBps,
          debtAmount: totalUsdValue > 0 ? (parsedAmount * BigInt(proportionBps)) / BigInt(10000) : 0n,
        };
      });

      // Ensure 100% allocation
      const totalAllocated = debtAllocations.reduce((sum, a) => sum + a.debtAmount, 0n);
      const remainder = parsedAmount - totalAllocated;

      if (remainder > 0 && debtAllocations.length > 0) {
        debtAllocations[0].debtAmount += remainder;
      }

      // For each collateral and its debt allocation, create redeposit + reborrow instructions
      const instructions = debtAllocations.map((allocation, index) => {
        // Skip if no debt allocated
        if (allocation.debtAmount <= 0n) return [];

        // Find the corresponding collateral from selectedCollateralsWithAmounts
        const collateral = selectedCollateralsWithAmounts.find(c => c.token === allocation.token);
        if (!collateral) return [];

        const isCollateralMaxClicked = maxClickedCollaterals[collateral.token] || false;
        const uppedAmount = isCollateralMaxClicked
          ? (collateral.amount * BigInt(101)) / BigInt(100)
          : collateral.amount;

        // Create context with paired tokens for Vesu (V1 or V2)
        const poolIdOrAddress = selectedProtocol === "VesuV2" ? BigInt(selectedV2PoolAddress) : 0n;
        const contextRedeposit = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
          poolIdOrAddress,
          BigInt(position.tokenAddress),
        ]);
        const contextReborrow = new CairoOption<bigint[]>(CairoOptionVariant.Some, [poolIdOrAddress, BigInt(collateral.token)]);
        const repayAll = isAmountMaxClicked && index === debtAllocations.length - 1;
        const nostraInstructions = [
          new CairoCustomEnum({
            Deposit: undefined,
            Borrow: undefined,
            Repay: {
              basic: {
                token: position.tokenAddress,
                amount: uint256.bnToUint256(allocation.debtAmount),
                user: userAddress,
              },
              repay_all: repayAll,
              context: new CairoOption<bigint[]>(CairoOptionVariant.None),
            },
            Withdraw: undefined,
            Redeposit: undefined,
            Reborrow: undefined,
          }),
          new CairoCustomEnum({
            Deposit: undefined,
            Borrow: undefined,
            Repay: undefined,
            Withdraw: {
              basic: {
                token: collateral.token,
                amount: uint256.bnToUint256(uppedAmount),
                user: userAddress,
              },
              withdraw_all: isCollateralMaxClicked,
              context: new CairoOption<bigint[]>(CairoOptionVariant.None),
            },
            Redeposit: undefined,
            Reborrow: undefined,
          }),
        ];

        const vesuInstructions = [
          new CairoCustomEnum({
            Deposit: undefined,
            Borrow: undefined,
            Repay: undefined,
            Withdraw: undefined,
            Redeposit: {
              token: collateral.token,
              target_output_pointer: toOutputPointer(1), // Point to corresponding withdraw instruction (offset by repay instruction)
              user: userAddress,
              context: contextRedeposit,
            },
            Reborrow: undefined,
          }),
          new CairoCustomEnum({
            Deposit: undefined,
            Borrow: undefined,
            Repay: undefined,
            Withdraw: undefined,
            Redeposit: undefined,
            Reborrow: {
              token: position.tokenAddress,
              target_output_pointer: toOutputPointer(0), // Point to repay instruction
              approval_amount: uint256.bnToUint256((allocation.debtAmount * BigInt(101)) / BigInt(100)), // Add 1% buffer
              user: userAddress,
              context: contextReborrow,
            },
          }),
        ];
        return [
          {
            protocol_name: lowerProtocolName,
            instructions: nostraInstructions,
          },
          {
            protocol_name: destProtocolName,
            instructions: vesuInstructions,
          },
        ];
      });
      // Compile the instructions
      const fullInstructionData = CallData.compile({
        instructions: instructions.flat(),
      });

      const filteredForAuth = instructions.flat().map(protocolInstruction => {
        const filteredInstructions = protocolInstruction.instructions.filter(instruction => {
          if (instruction.activeVariant() === "Withdraw" || instruction.activeVariant() === "Reborrow") {
            return true;
          }
          return false;
        });
        return { protocol_name: protocolInstruction.protocol_name, instructions: filteredInstructions };
      });

      const authInstructionData = CallData.compile({
        instructions: filteredForAuth,
        rawSelectors: false,
      });

      return {
        fullInstruction: fullInstructionData,
        authInstruction: authInstructionData,
        authInstructions: filteredForAuth,
        authCalldataKey: JSON.stringify(authInstructionData),
        pairInstructions: instructions,
      };
    };

    // If target protocol is Vesu (V1 or V2) and we have multiple collaterals, use proportional allocation
    if ((selectedProtocol === "Vesu" || selectedProtocol === "VesuV2") && selectedCollateralsWithAmounts.length > 1) {
      const result = generateVesuInstructions() || {
        fullInstruction: { instructions: [] },
        authInstruction: { instructions: [] },
        authInstructions: [],
        authCalldataKey: "",
        pairInstructions: [],
      };
      return result;
    }

    const resolvedCollateralAddresses = selectedCollateralsWithAmounts.map(collateral => {
      const plan = collateralSwapPlans[collateral.token];
      if (!collateral.supported && plan?.quote && plan.quote.calldata.length > 0) {
        return plan.target.address;
      }
      return collateral.token;
    });
    const primaryResolvedCollateral = resolvedCollateralAddresses[0];

    // Otherwise, use the original approach for other protocols or single collateral
    let repayInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.None);
    let withdrawInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.None);

    // Handle V1 Vesu context
    if (fromProtocol === "Vesu" && selectedCollateralsWithAmounts.length > 0) {
      repayInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
        currentPoolId || 0n,
        BigInt(primaryResolvedCollateral ?? selectedCollateralsWithAmounts[0].token),
      ]);
      withdrawInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
        currentPoolId || 0n,
        BigInt(position.tokenAddress),
      ]);
    }

    // Handle V2 Vesu context
    if (fromProtocol === "VesuV2" && selectedCollateralsWithAmounts.length > 0) {
      const sourcePoolAddress = normalizedCurrentV2PoolAddress ?? selectedV2PoolAddress;
      repayInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
        BigInt(sourcePoolAddress),
        BigInt(primaryResolvedCollateral ?? selectedCollateralsWithAmounts[0].token),
      ]);
      withdrawInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
        BigInt(sourcePoolAddress),
        BigInt(position.tokenAddress),
      ]);
    }

    let borrowInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.None);
    let depositInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.None);

    // Handle V1 Vesu target context
    if (selectedProtocol === "Vesu" && selectedCollateralsWithAmounts.length > 0) {
      borrowInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
        selectedPoolId,
        BigInt(selectedCollateralsWithAmounts[0].token),
      ]);
      depositInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
        selectedPoolId,
        BigInt(position.tokenAddress),
      ]);
    }
    
    // Handle V2 Vesu target context
    if (selectedProtocol === "VesuV2" && selectedCollateralsWithAmounts.length > 0) {
      borrowInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
        BigInt(selectedV2PoolAddress),
        BigInt(selectedCollateralsWithAmounts[0].token),
      ]);
      depositInstructionContext = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
        BigInt(selectedV2PoolAddress),
        BigInt(position.tokenAddress),
      ]);
    }

    const repayInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: {
        basic: {
          token: position.tokenAddress,
          amount: uint256.bnToUint256(parsedAmount),
          user: userAddress,
        },
        repay_all: isAmountMaxClicked,
        context: repayInstructionContext,
      },
      Withdraw: undefined,
      Redeposit: undefined,
      Reborrow: undefined,
    });

    // Auth instructions only need withdraw and borrow
    const withdrawInstructions = selectedCollateralsWithAmounts.map(collateral => {
      // Check if MAX was clicked for this collateral
      const isCollateralMaxClicked = maxClickedCollaterals[collateral.token] || false;
      // Add 1% buffer if MAX was clicked for this collateral
      const uppedAmount = isCollateralMaxClicked ? (collateral.amount * BigInt(101)) / BigInt(100) : collateral.amount;
      const amount = uint256.bnToUint256(uppedAmount);

      return new CairoCustomEnum({
        Deposit: undefined,
        Borrow: undefined,
        Repay: undefined,
        Withdraw: {
          basic: {
            token: collateral.token,
            amount: amount,
            user: userAddress,
          },
          withdraw_all: isCollateralMaxClicked,
          context: withdrawInstructionContext,
        },
        Redeposit: undefined,
        Reborrow: undefined,
      });
    });

    const swapInstructions: CairoCustomEnum[] = [];
    const swapInstructionIndexMap = new Map<string, number>();

    selectedCollateralsWithAmounts.forEach((collateral, index) => {
      const plan = collateralSwapPlans[collateral.token];
      if (!collateral.supported && plan?.quote && plan.quote.calldata.length > 0) {
        const withdrawPointer = 1 + index;
        const minOutClamped = plan.quote.minOut > 0n ? plan.quote.minOut : plan.quote.rawQuote.buyAmount;
        const reswapExactIn = new CairoCustomEnum({
          Deposit: undefined,
          Borrow: undefined,
          Repay: undefined,
          Withdraw: undefined,
          Redeposit: undefined,
          Reborrow: undefined,
          Swap: undefined,
          SwapExactIn: undefined,
          Reswap: undefined,
          ReswapExactIn: {
            exact_in: toOutputPointer(withdrawPointer),
            min_out: uint256.bnToUint256(minOutClamped),
            token_out: plan.target.address,
            user: userAddress,
            should_pay_out: false,
            should_pay_in: false,
            context: new CairoOption(CairoOptionVariant.Some, plan.quote.calldata),
          },
        });
        swapInstructionIndexMap.set(collateral.token, swapInstructions.length);
        swapInstructions.push(reswapExactIn);
      }
    });

    const depositInstructions = selectedCollateralsWithAmounts.map((collateral, index) => {
      const plan = collateralSwapPlans[collateral.token];
      const hasSwap = !collateral.supported && plan?.quote && plan.quote.calldata.length > 0;
      const depositToken = hasSwap ? plan.target.address : collateral.token;
      const withdrawBaseIndex = 1; // repay instruction is at index 0
      const swapBaseIndex = withdrawBaseIndex + withdrawInstructions.length;
      const pointerIndex = hasSwap
        ? swapBaseIndex + (swapInstructionIndexMap.get(collateral.token) ?? 0)
        : withdrawBaseIndex + index;
      const pointerOutput = hasSwap ? resolveSwapOutputIndex(plan.quote?.entrypoint) : 0;
      return new CairoCustomEnum({
        Deposit: undefined,
        Borrow: undefined,
        Repay: undefined,
        Withdraw: undefined,
        Redeposit: {
          token: depositToken,
          target_output_pointer: toOutputPointer(pointerIndex, pointerOutput),
          user: userAddress,
          context: depositInstructionContext,
        },
        Reborrow: undefined,
      });
    });

    const borrowInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: undefined,
      Withdraw: undefined,
      Redeposit: undefined,
      Reborrow: {
        token: position.tokenAddress,
        target_output_pointer: toOutputPointer(0),
        approval_amount: uint256.bnToUint256((parsedAmount * BigInt(101)) / BigInt(100)),
        user: userAddress,
        context: borrowInstructionContext,
      },
    });

    const instructions: { protocol_name: string; instructions: CairoCustomEnum[] }[] = [
      {
        protocol_name: lowerProtocolName,
        instructions: [repayInstruction, ...withdrawInstructions],
      },
    ];

    if (swapInstructions.length > 0) {
      instructions.push({
        protocol_name: "avnu",
        instructions: swapInstructions,
      });
    }

    instructions.push({
      protocol_name: destProtocolName,
      instructions: [...depositInstructions, borrowInstruction],
    });

    // Complete set of instructions for execution
    const fullInstructionData = CallData.compile({
      instructions: instructions,
    });

    const authInstructions = [
      {
        protocol_name: lowerProtocolName,
        instructions: [...withdrawInstructions],
      },

      {
        protocol_name: destProtocolName,
        instructions: [borrowInstruction],
      },
    ];
    if (isOpen) {
      console.log("authInstructions", authInstructions);
      console.log("fullInstructions", instructions);
    }
    
    // Only withdraw and borrow instructions for authorization
    const authInstructionData = CallData.compile({
      instructions: authInstructions,
      rawSelectors: false,
    });

    return {
      fullInstruction: fullInstructionData,
      authInstruction: authInstructionData,
      authInstructions: authInstructions,
      authCalldataKey: JSON.stringify(authInstructionData),
      // Wrap instructions in an array so that callers always
      // receive a list of instruction pairs. This ensures we
      // execute a single move_debt call when moving between
      // Vesu and Nostra while still supporting multiple calls
      // for scenarios that require it (e.g. Nostra -> Vesu with
      // several collaterals).
      pairInstructions: [instructions],
    };
  }, [
    amount,
    userAddress,
    routerGateway?.address,
    position.decimals,
    position.tokenAddress,
    fromProtocol,
    selectedProtocol,
    selectedCollateralsWithAmounts,
    collateralSwapPlans,
    collateralSwapSelections,
    isAmountMaxClicked,
    tokenToPrices,
    maxClickedCollaterals,
    currentPoolId,
    selectedPoolId,
    selectedV2PoolAddress,
    normalizedCurrentV2PoolAddress,
    swapBlocking,
    isOpen,
  ]);

  const vesuPairings = useMemo(() => {
    if (
      fromProtocol !== "Nostra" ||
      selectedProtocol !== "Vesu" ||
      !amount ||
      selectedCollateralsWithAmounts.length === 0
    ) {
      return [] as (CollateralWithAmount & { debtAmount: bigint })[];
    }

    try {
      const tokenDecimals = position.decimals ?? 18;
      const parsedAmount = parseUnits(amount, tokenDecimals);

      const collateralUsdValues = selectedCollateralsWithAmounts.map(collateral => {
        const tokenDecimals = collateral.decimals || 18;
        const normalizedAmount = Number(formatUnits(collateral.amount, tokenDecimals));
        const tokenPrice = tokenToPrices[collateral.token.toLowerCase()];

        let usdValue = normalizedAmount;
        if (tokenPrice) {
          usdValue = normalizedAmount * Number(formatUnits(tokenPrice, 8));
        }

        return {
          ...collateral,
          usdValue,
        };
      });

      const totalUsdValue = collateralUsdValues.reduce((sum, c) => sum + c.usdValue, 0);

      const allocations = collateralUsdValues.map(collateral => {
        const proportionBps = totalUsdValue > 0 ? Math.floor((collateral.usdValue / totalUsdValue) * 10000) : 0;
        const debtAmount = totalUsdValue > 0 ? (parsedAmount * BigInt(proportionBps)) / BigInt(10000) : 0n;
        return { ...collateral, debtAmount };
      });

      const allocatedSum = allocations.reduce((sum, a) => sum + a.debtAmount, 0n);
      const remainder = parsedAmount - allocatedSum;
      if (remainder > 0n && allocations.length > 0) {
        allocations[0].debtAmount += remainder;
      }

      return allocations;
    } catch {
      return [] as (CollateralWithAmount & { debtAmount: bigint })[];
    }
  }, [fromProtocol, selectedProtocol, amount, selectedCollateralsWithAmounts, tokenToPrices, position.decimals]);

  // Get authorizations for the instructions
  useEffect(() => {
    let cancelled = false;
    const fetchAuths = async () => {
      try {
        if (!isOpen || !isAuthReady || !authInstructions || (Array.isArray(authInstructions) && authInstructions.length === 0) || !authCalldataKey) {
          setFetchedAuthorizations([]);
          return;
        }
        const auths = await getAuthorizations(authInstructions as any);
        if (!cancelled) setFetchedAuthorizations(auths);
      } catch (e) {
        if (!cancelled) setFetchedAuthorizations([]);
        if (isOpen) {
          console.log("authInstructions", authInstructions);
          console.log("error", e);
        }
      }
    };
    fetchAuths();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isAuthReady, getAuthorizations, authCalldataKey]);

  const tokensRequiringSwapApproval = useMemo(() => {
    const tokens = new Set<string>();

    selectedCollateralsWithAmounts.forEach(collateral => {
      const plan = collateralSwapPlans[collateral.token];
      if (!collateral.supported && plan?.quote && plan.quote.calldata.length > 0) {
        try {
          tokens.add(normalizeStarknetAddress(plan.target.address));
        } catch (err) {
          console.error("Failed to normalize approval token address", err);
        }
      }
    });

    return Array.from(tokens);
  }, [selectedCollateralsWithAmounts, collateralSwapPlans]);

  useEffect(() => {
    if (!provider || !routerGateway?.address) {
      setSwapApprovalSpenders({});
      return;
    }

    if (tokensRequiringSwapApproval.length === 0) {
      setSwapApprovalSpenders({});
      return;
    }

    let cancelled = false;
    const defaultSpender = normalizeStarknetAddress(routerGateway.address);

    const resolveSpenders = async () => {
      const entries = await Promise.all(
        tokensRequiringSwapApproval.map(async tokenAddress => {
          let spender = defaultSpender;

          if (selectedProtocol === "VesuV2") {
            try {
              const normalizedPool = normalizeStarknetAddress(selectedV2PoolAddress);
              const vToken = await getVTokenForAsset(
                provider,
                normalizedPool as `0x${string}`,
                tokenAddress as `0x${string}`,
              );
              if (vToken !== "0x0") {
                spender = normalizeStarknetAddress(vToken);
              }
            } catch (err) {
              console.warn("Failed to resolve Vesu vToken for", tokenAddress, err);
            }
          }

          return [tokenAddress.toLowerCase(), spender] as const;
        }),
      );

      if (!cancelled) {
        setSwapApprovalSpenders(Object.fromEntries(entries));
      }
    };

    resolveSpenders();

    return () => {
      cancelled = true;
    };
  }, [
    provider,
    routerGateway?.address,
    selectedProtocol,
    selectedV2PoolAddress,
    tokensRequiringSwapApproval,
  ]);

  const swapApprovalAuthorizations = useMemo(() => {
    if (!routerGateway?.address || tokensRequiringSwapApproval.length === 0)
      return [] as LendingAuthorization[];

    const approvalAmount = uint256.bnToUint256(MAX_APPROVAL_AMOUNT);
    const defaultSpender = normalizeStarknetAddress(routerGateway.address);
    const seenAuthorizations = new Set(
      (fetchedAuthorizations ?? []).map(authorization => `${authorization.contractAddress.toLowerCase()}::${authorization.entrypoint}`),
    );

    const approvals: LendingAuthorization[] = [];
    tokensRequiringSwapApproval.forEach(tokenAddress => {
      const normalizedToken = tokenAddress.toLowerCase();
      const key = `${normalizedToken}::approve`;
      if (seenAuthorizations.has(key)) {
        return;
      }

      const spender = swapApprovalSpenders[normalizedToken] ?? defaultSpender;

      approvals.push({
        contractAddress: tokenAddress,
        entrypoint: "approve",
        calldata: [
          spender,
          num.toHexString(approvalAmount.low),
          num.toHexString(approvalAmount.high),
        ],
      });
    });

    return approvals;
  }, [
    routerGateway?.address,
    fetchedAuthorizations,
    swapApprovalSpenders,
    tokensRequiringSwapApproval,
  ]);

  // Construct calls based on current state
  const calls = useMemo(() => {
    if (!pairInstructions || pairInstructions.length === 0) return [];

    const authorizations = fetchedAuthorizations ?? [];
    const combinedAuthorizations = [...authorizations, ...swapApprovalAuthorizations];
    const revokeAuthorizations = buildModifyDelegationRevokeCalls(combinedAuthorizations);
    const moveCalls = pairInstructions.map(instructions => ({
      contractName: "RouterGateway" as const,
      functionName: "move_debt" as const,
      args: CallData.compile({ instructions: instructions }),
    }));

    return [
      ...(combinedAuthorizations as any),
      ...moveCalls,
      ...(revokeAuthorizations as any),
    ];
  }, [fetchedAuthorizations, pairInstructions, swapApprovalAuthorizations]);

  const { sendAsync } = useScaffoldMultiWriteContract({ calls });

  const estimateCalls = useMemo(() => {
    if (!routerGateway?.address || !pairInstructions || pairInstructions.length === 0)
      return null;
    const authorizations = fetchedAuthorizations ?? [];
    const combinedAuthorizations = [...authorizations, ...swapApprovalAuthorizations];
    const revokeAuthorizations = buildModifyDelegationRevokeCalls(combinedAuthorizations);
    const moveCalls = pairInstructions.map(instructions => ({
      contractAddress: routerGateway.address,
      entrypoint: "move_debt",
      calldata: CallData.compile({ instructions }),
    }));
    return [
      ...(combinedAuthorizations as any),
      ...moveCalls,
      ...(revokeAuthorizations as any),
    ];
  }, [routerGateway?.address, fetchedAuthorizations, pairInstructions, swapApprovalAuthorizations]);

  const {
    loading: feeLoading,
    error: feeError,
    effectiveNative,
    effectiveCurrency,
  } = useGasEstimate({
    enabled: isOpen,
    buildCalls: () => estimateCalls ?? null,
    currency: "STRK",
  });

  // Reset the modal state when opening/closing
  useEffect(() => {
    if (!isOpen) {
      setAmount("");
      amountRef.current = "";
      setError(null);
      setStep("idle");
      setLoading(false);
      setSelectedCollateralsWithAmounts([]);
      setMaxClickedCollaterals({});
      setIsAmountMaxClicked(false);
      setCollateralSwapSelections({});
      setCollateralSwapPlans({});
    }
  }, [isOpen]);

  // Initialize selected collaterals when preselected ones are provided
  useEffect(() => {
    if (isOpen && preSelectedCollaterals && preSelectedCollaterals.length > 0) {
      setSelectedCollateralsWithAmounts(prev => {
        if (prev.length === 0) {
          return preSelectedCollaterals.map(c => ({ ...c, amount: 0n, inputValue: "" }));
        }

        const existing = new Map(prev.map(c => [c.token.toLowerCase(), c]));
        const merged = preSelectedCollaterals.map(c => {
          const key = c.token.toLowerCase();
          return existing.get(key) || { ...c, amount: 0n, inputValue: "" };
        });
        const others = prev.filter(
          c => !preSelectedCollaterals.some(p => p.token.toLowerCase() === c.token.toLowerCase()),
        );
        return [...merged, ...others];
      });
    }
  }, [isOpen, preSelectedCollaterals]);

  // Handler for collateral selection and amount changes - wrap in useCallback
  const handleCollateralSelectionChange = useCallback((collaterals: CollateralWithAmount[]) => {
    // Update the selected collaterals
    setSelectedCollateralsWithAmounts(collaterals);

    // When collateral selection changes, reset MAX clicked states for any removed collaterals
    setMaxClickedCollaterals(prevState => {
      const updatedMaxClicked = { ...prevState };
      const newTokens = new Set(collaterals.map(c => c.token));

      // Remove entries for tokens that are no longer selected
      Object.keys(updatedMaxClicked).forEach(token => {
        if (!newTokens.has(token)) {
          delete updatedMaxClicked[token];
        }
      });

      return updatedMaxClicked;
    });
  }, []);

  // Ensure swap selections exist only for unsupported collaterals that are currently selected
  useEffect(() => {
    setCollateralSwapSelections(prev => {
      const next = { ...prev };

      Object.keys(next).forEach(token => {
        const isStillUnsupported = selectedCollateralsWithAmounts.some(
          collateral => collateral.token === token && !collateral.supported,
        );
        if (!isStillUnsupported) {
          delete next[token];
        }
      });

      selectedCollateralsWithAmounts.forEach(collateral => {
        if (!collateral.supported && next[collateral.token] === undefined) {
          next[collateral.token] = null;
        }
      });

      return next;
    });
  }, [selectedCollateralsWithAmounts]);

  useEffect(() => {
    if (isCompatibilityLoading) return;

    setCollateralSwapSelections(prev => {
      let changed = false;
      const next = { ...prev };

      incompatibleCollaterals.forEach(collateral => {
        const options = poolSupportedTargetCollaterals.filter(
          option => option.address.toLowerCase() !== collateral.token.toLowerCase(),
        );

        if (options.length === 0) {
          if (next[collateral.token] !== null) {
            next[collateral.token] = null;
            changed = true;
          }
          return;
        }

        const current = next[collateral.token];
        const currentAddress = current?.address.toLowerCase();
        const isCurrentValid = currentAddress
          ? options.some(option => option.address.toLowerCase() === currentAddress)
          : false;

        if (!isCurrentValid) {
          const suggestion = options[0];
          next[collateral.token] = {
            address: suggestion.address,
            symbol: suggestion.symbol,
            decimals: suggestion.decimals,
          };
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [
    isCompatibilityLoading,
    incompatibleCollaterals,
    poolSupportedTargetCollaterals,
  ]);

  // Remove swap plans when collateral becomes compatible or selection cleared
  useEffect(() => {
    setCollateralSwapPlans(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(token => {
        const matchingCollateral = selectedCollateralsWithAmounts.find(
          collateral => collateral.token === token && !collateral.supported,
        );
        const hasSelection = collateralSwapSelections[token];
        if (!matchingCollateral || !hasSelection) {
          delete next[token];
        }
      });
      return next;
    });
  }, [selectedCollateralsWithAmounts, collateralSwapSelections]);

  // Handle MAX click for a specific collateral - wrap in useCallback
  const handleCollateralMaxClick = useCallback(
    (collateralToken: string, maxAmount: bigint, formattedMaxAmount: string) => {
      // Update the collateral amount to max
      setSelectedCollateralsWithAmounts(prev =>
        prev.map(c => (c.token === collateralToken ? { ...c, amount: maxAmount, inputValue: formattedMaxAmount } : c)),
      );

      // Mark this collateral as having MAX clicked
      setMaxClickedCollaterals(prev => ({
        ...prev,
        [collateralToken]: true,
      }));
    },
    [],
  );

  const handleCollateralSwapPlanChange = useCallback(
    (collateralToken: string, plan: CollateralSwapPlan | null) => {
      setCollateralSwapPlans(prev => {
        if (!plan) {
          if (!(collateralToken in prev)) {
            return prev;
          }
          const { [collateralToken]: _, ...rest } = prev;
          return rest;
        }

        const existing = prev[collateralToken];
        if (
          existing &&
          existing.target.address.toLowerCase() === plan.target.address.toLowerCase() &&
          existing.status === plan.status &&
          existing.error === plan.error &&
          existing.quote === plan.quote
        ) {
          return prev;
        }

        return { ...prev, [collateralToken]: plan };
      });
    },
    [],
  );

  const handleSwapTargetSelection = useCallback(
    (collateralToken: string, targetAddress: string) => {
      let selectionChanged = false;

      setCollateralSwapSelections(prev => {
        const next = { ...prev };
        const previousSelection = prev[collateralToken];
        const previousAddress = previousSelection?.address?.toLowerCase() ?? "";

        if (!targetAddress) {
          if (previousSelection === null) {
            return prev;
          }
          next[collateralToken] = null;
          selectionChanged = true;
          return next;
        }

        const match = poolSupportedTargetCollaterals.find(
          collateral => collateral.address.toLowerCase() === targetAddress.toLowerCase(),
        );

        if (!match) {
          return prev;
        }

        const nextAddress = match.address.toLowerCase();
        if (previousAddress === nextAddress) {
          return prev;
        }

        next[collateralToken] = {
          address: match.address,
          symbol: match.symbol,
          decimals: match.decimals,
        };
        selectionChanged = true;
        return next;
      });

      if (selectionChanged) {
        setCollateralSwapPlans(current => {
          if (!(collateralToken in current)) return current;
          const { [collateralToken]: _, ...rest } = current;
          return rest;
        });
      }
    },
    [poolSupportedTargetCollaterals],
  );

  // Add this new useCallback for amount handling
  const handleAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value);
    setIsAmountMaxClicked(false); // Reset MAX state when value is manually changed
  }, []);

  const handleMaxClick = useCallback(() => {
    try {
      // Convert BigInt to string for formatUnits
      if (!position.balance) {
        setAmount("0");
        return;
      }

      const formattedMaxValue = formatUnits(position.balance, position.decimals);
      const maxValue = parseFloat(formattedMaxValue);

      if (!isNaN(maxValue) && isFinite(maxValue)) {
        // Ensure proper string formatting based on decimals
        setAmount(formattedMaxValue);
        setIsAmountMaxClicked(true); // Track that MAX was clicked
      } else {
        setAmount("0");
        console.error("Invalid position balance:", position.balance);
      }
    } catch (error) {
      console.error("Error setting max amount:", error);
      setAmount("0");
    }
  }, [position.balance, position.decimals]);

  // Modify the protocol selection handler
  const handleProtocolSelection = (protocolName: string) => {
    setSelectedProtocol(protocolName);
    // Reset pool selection when changing protocols
    if (protocolName !== "Vesu" && protocolName !== "VesuV2") {
      setSelectedPoolId(VESU_V1_POOLS["Genesis"]);
    }
    if (protocolName === "VesuV2") {
      setSelectedV2PoolAddress(
        fromProtocol === "VesuV2" && normalizedCurrentV2PoolAddress
          ? normalizedCurrentV2PoolAddress
          : VESU_V2_POOLS["Default"],
      );
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (fromProtocol === "VesuV2" && normalizedCurrentV2PoolAddress) {
      setSelectedV2PoolAddress(normalizedCurrentV2PoolAddress);
    }
  }, [isOpen, fromProtocol, normalizedCurrentV2PoolAddress]);

  const handleMovePosition = async () => {
    try {
      if (!userAddress) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      setStep("executing");

      // Execute the transaction
      const tx = await sendAsync();

      setStep("done");
      // Close modal after a short delay on success
      setTimeout(() => onClose(), 2000);
    } catch (err: any) {
      console.error("Move position failed:", err);
      setError(err.message || "Move position failed");
      setStep("idle");
    } finally {
      setLoading(false);
    }
  };

  // Get action button text based on current step
  const actionButtonText = useMemo(() => {
    if (loading) {
      switch (step) {
        case "executing":
          return "Moving...";
        default:
          return "Processing...";
      }
    }

    if (step === "done") {
      return "Done!";
    }

    return "Migrate";
  }, [loading, step]);

  // Get action button class based on current step
  const actionButtonClass = useMemo(() => {
    if (step === "done") {
      return "btn-success";
    }
    return "btn-primary";
  }, [step]);

  // Helper function to safely format the balance
  const getFormattedBalance = useMemo(() => {
    try {
      if (!balance) return "0.00";
      return formatDisplayNumber(Number(formatUnits(balance, decimals)));
    } catch (error) {
      return "0.00";
    }
  }, [balance, decimals]);

  const isActionDisabled =
    loading ||
    isCompatibilityLoading ||
    swapLoading ||
    swapBlocking ||
    !selectedProtocol ||
    !amount ||
    !!(position.type === "borrow" && selectedCollateralsWithAmounts.length === 0) ||
    step !== "idle" ||
    // Disable V1 -> V1 when target pool equals current pool id
    (fromProtocol === "Vesu" && selectedProtocol === "Vesu" && selectedPoolId === currentPoolId) ||
    (fromProtocol === "VesuV2" &&
      selectedProtocol === "VesuV2" &&
      normalizedCurrentV2PoolAddress !== undefined &&
      normalizedCurrentV2PoolAddress === normalizeStarknetAddress(selectedV2PoolAddress));

  return (
    <dialog className={`modal ${isOpen ? "modal-open" : ""}`}>
      <div className="modal-box bg-base-100 max-w-5xl max-h-[90vh] min-h-[360px] p-6 rounded-none flex flex-col">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 flex-grow overflow-y-auto">
            {/* FROM SECTION */}
            <div className="space-y-6 md:col-span-3">
              <label className="text-sm font-medium text-base-content/80">From</label>
              <div className="flex items-center gap-3 h-12 border-b-2 border-base-300 px-1">
                <Image
                  src={getProtocolLogo(fromProtocol)}
                  alt={fromProtocol}
                  width={32}
                  height={32}
                  className="rounded-full min-w-[32px]"
                />
                <span className="truncate font-semibold text-lg">{fromProtocol}</span>
              </div>
              {position.type === "borrow" && (
                isLoadingCollaterals ? (
                  <div className="flex flex-col items-center justify-center py-4">
                    <span className="loading loading-spinner loading-md mb-2"></span>
                    <span className="text-base-content/70 text-xs">Loading collaterals...</span>
                  </div>
                ) : (
                  <div className="mt-6">
                    <CollateralSelector
                      collaterals={collateralsForSelector}
                      isLoading={false}
                      selectedProtocol={selectedProtocol}
                      onCollateralSelectionChange={handleCollateralSelectionChange}
                      marketToken={position.tokenAddress}
                      onMaxClick={handleCollateralMaxClick}
                      hideAmounts
                      initialSelectedCollaterals={selectedCollateralsWithAmounts}
                    />
                  </div>
                )
              )}
            </div>

            {/* AMOUNTS SECTION */}
            <div className="space-y-6 md:col-span-6">
              <div className="text-center mb-2">
                <label className="block text-lg font-semibold flex items-center justify-center gap-1">
                  Debt
                  {position.type === "supply" && (
                    <FiLock className="text-emerald-500 w-4 h-4" title="Supplied asset" />
                  )}
                </label>
                <div className="text-xs text-base-content/60">
                  Available: {getFormattedBalance} {position.name}
        </div>
      </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 w-32 shrink-0">
                  <div className="w-6 h-6 relative">
                    <Image
                      src={tokenNameToLogo(position.name)}
                      alt={position.name}
                      fill
                      className="rounded-full object-contain"
                    />
                  </div>
                  <span className="truncate font-medium">{position.name}</span>
                </div>
                <input
                  type="text"
                  className="flex-1 border-b-2 border-base-300 focus:border-primary bg-transparent px-2 h-14 text-lg text-right"
                  placeholder="0.00"
                  value={amount}
                  onChange={handleAmountChange}
                  disabled={loading || step !== "idle"}
                />
                <button
                  className="text-xs font-medium px-2 py-1"
                  onClick={handleMaxClick}
                  disabled={loading || step !== "idle"}
                >
                  MAX
                </button>
              </div>
              {position.type === "borrow" && (
                <>
                  <CollateralAmounts
                    collaterals={selectedCollateralsWithAmounts}
                    onChange={setSelectedCollateralsWithAmounts}
                    selectedProtocol={selectedProtocol}
                    onMaxClick={(token, isMax) =>
                      setMaxClickedCollaterals(prev => ({ ...prev, [token]: isMax }))
                    }
                  />
                  {incompatibleCollaterals.length > 0 && (
                    <div className="mt-4 space-y-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
                      <div className="font-semibold text-warning-700">
                        {selectedProtocol ? `${selectedProtocol} compatibility` : "Collateral compatibility"}
                      </div>
                      <div className="text-xs text-warning-800">
                        Some collateral must be swapped to assets supported by the target protocol before redepositing.
                      </div>
                      {isCompatibilityLoading && (
                        <div className="flex items-center gap-2 text-warning-700 text-xs">
                          <span className="loading loading-spinner loading-xs" /> Checking collateral compatibility…
                        </div>
                      )}
                      {incompatibleCollaterals.map(collateral => {
                        const selection = collateralSwapSelections[collateral.token];
                        const options = poolSupportedTargetCollaterals.filter(
                          token => token.address.toLowerCase() !== collateral.token.toLowerCase(),
                        );
                        const hasOptions = options.length > 0;
                        const selectPlaceholder = isCompatibilityLoading
                          ? "Checking compatibility…"
                          : hasOptions
                            ? "Select target collateral"
                            : "No compatible collateral";

                        return (
                          <CollateralSwapPlannerRow
                            key={collateral.token}
                            collateral={collateral}
                            selection={selection ?? null}
                            options={options}
                            hasOptions={hasOptions}
                            selectPlaceholder={selectPlaceholder}
                            isCompatibilityLoading={isCompatibilityLoading}
                            selectedProtocol={selectedProtocol}
                            onSelect={address => handleSwapTargetSelection(collateral.token, address)}
                            userAddress={userAddress}
                            chainId={chainId}
                            onPlanChange={plan => handleCollateralSwapPlanChange(collateral.token, plan)}
                          />
                        );
                      })}
                    </div>
                  )}
                  {disableCollateralSelection && preSelectedCollaterals && preSelectedCollaterals.length > 0 && (
                    <div className="text-xs text-base-content/70 mt-2 p-2 bg-info/10 rounded">
                      <strong>Note:</strong> Vesu uses collateral-debt pair isolation. You can adjust the amount, but this
                      collateral cannot be changed.
                    </div>
                  )}
                </>
              )}
              {error && (
                <div className="alert alert-error shadow-lg">
                  <FiAlertTriangle className="w-6 h-6" />
                  <div className="text-sm flex-1">{error}</div>
                </div>
              )}

              <div className="flex justify-between text-sm text-base-content/70">
                <span>Debt Value: ${formatDisplayNumber(debtUsdValue)}</span>
                {position.type === "borrow" && (
                  <span>Collateral Value: ${formatDisplayNumber(totalCollateralUsd)}</span>
                )}
              </div>

            </div>

            {/* TO SECTION */}
            <div className="flex flex-col md:col-span-3 h-full">
              <div className="space-y-6 flex-1">
                <div>
                  <label className="text-sm font-medium text-base-content/80">To</label>
                  <div className="dropdown w-full">
                    <div
                      tabIndex={0}
                      className="border-b-2 border-base-300 py-2 px-1 flex items-center justify-between cursor-pointer h-12"
                    >
                      <div className="flex items-center gap-3 w-[calc(100%-32px)] overflow-hidden">
                        {selectedProtocol ? (
                          <>
                            <Image
                              src={getProtocolLogo(selectedProtocol)}
                              alt={selectedProtocol}
                              width={32}
                              height={32}
                              className="rounded-full min-w-[32px]"
                            />
                            <span className="truncate font-semibold text-lg">{selectedProtocol}</span>
                          </>
                        ) : (
                          <span className="text-base-content/50">Select protocol</span>
                        )}
                      </div>
                      <svg className="w-4 h-4 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    <ul
                      tabIndex={0}
                      className="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-lg w-full z-50 dropdown-bottom mt-1"
                    >
                      {protocols
                        .filter(p => p.name !== fromProtocol || (p.name === "Vesu" && fromProtocol === "Vesu") || (p.name === "VesuV2" && fromProtocol === "VesuV2"))
                        .map(protocol => (
                          <li key={protocol.name}>
                            <button
                              className="flex items-center gap-3 py-2"
                              onClick={() => handleProtocolSelection(protocol.name)}
                            >
                              <Image
                                src={getProtocolLogo(protocol.name)}
                                alt={protocol.name}
                                width={32}
                                height={32}
                                className="rounded-full min-w-[32px]"
                              />
                              <span className="truncate text-lg">{protocol.name}</span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>

                {selectedProtocol === "Vesu" && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-sm font-medium text-base-content/80">Target Pool</label>
                    {fromProtocol === "Vesu" && (
                      <div className="text-sm bg-base-200/60 py-1 px-3 rounded-lg flex items-center">
                        <span className="text-base-content/70">Current Pool:</span>
                        <span className="font-medium ml-1">{currentPoolId !== undefined ? getV1PoolNameFromId(currentPoolId) : "Unknown"}</span>
                      </div>
                    )}
                  </div>
                  <div className="dropdown w-full">
                    <div
                      tabIndex={0}
                      className="border-b-2 border-base-300 py-2 px-1 flex items-center justify-between cursor-pointer h-12"
                    >
                      <div className="flex items-center gap-3 w-[calc(100%-32px)] overflow-hidden">
                        {Object.entries(VESU_V1_POOLS).map(([name, id]) =>
                          id === selectedPoolId ? (
                            <span key={name} className="truncate font-semibold text-lg">
                              {name}
                            </span>
                          ) : null,
                        )}
                      </div>
                      <svg className="w-4 h-4 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    <ul
                      tabIndex={0}
                      className="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-lg w-full z-50 dropdown-bottom mt-1"
                    >
                      {Object.entries(VESU_V1_POOLS)
                        .filter(([name, id]) => fromProtocol !== "Vesu" || id !== currentPoolId)
                        .map(([name, id]) => (
                          <li key={name}>
                            <button className="flex items-center gap-3 py-2" onClick={() => setSelectedPoolId(id as bigint)}>
                              <Image
                                src="/logos/vesu.svg"
                                alt="Vesu"
                                width={32}
                                height={32}
                                className="rounded-full min-w-[32px]"
                              />
                              <span className="truncate text-lg">{name}</span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
                )}

                {selectedProtocol === "VesuV2" && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-sm font-medium text-base-content/80">Target Pool</label>
                      <div className="text-sm bg-base-200/60 py-1 px-3 rounded-lg flex items-center">
                        <span className="text-base-content/70">V2 Pool:</span>
                        <span className="font-medium ml-1">{getV2PoolNameFromAddress(selectedV2PoolAddress)}</span>
                      </div>
                    </div>
                    <div className="dropdown w-full">
                      <div
                        tabIndex={0}
                        className="border-b-2 border-base-300 py-2 px-1 flex items-center justify-between cursor-pointer h-12"
                      >
                        <div className="flex items-center gap-3 w-[calc(100%-32px)] overflow-hidden">
                          {Object.entries(VESU_V2_POOLS).map(([name, addr]) =>
                            addr.toLowerCase() === selectedV2PoolAddress.toLowerCase() ? (
                              <span key={name} className="truncate font-semibold text-lg">
                                {name}
                              </span>
                            ) : null,
                          )}
                        </div>
                        <svg className="w-4 h-4 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                      <ul
                        tabIndex={0}
                        className="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-lg w-full z-50 dropdown-bottom mt-1"
                      >
                        {Object.entries(VESU_V2_POOLS).map(([name, addr]) => (
                          <li key={name}>
                            <button className="flex items-center gap-3 py-2" onClick={() => setSelectedV2PoolAddress(addr)}>
                              <Image
                                src="/logos/vesu.svg"
                                alt="VesuV2"
                                width={32}
                                height={32}
                                className="rounded-full min-w-[32px]"
                              />
                              <span className="truncate text-lg">{name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {fromProtocol === "Nostra" && selectedProtocol === "Vesu" && vesuPairings.length > 0 && (
                  <div className="bg-base-200/40 p-2 rounded space-y-1">
                    {vesuPairings.map(p => (
                      <div key={p.token} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1">
                          <Image
                            src={tokenNameToLogo(p.symbol)}
                            alt={p.symbol}
                            width={16}
                            height={16}
                            className="rounded-full"
                          />
                          <span>{p.symbol}</span>
                          <span>
                            {Number(formatUnits(p.amount, p.decimals)).toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Image
                            src={tokenNameToLogo(position.name)}
                            alt={position.name}
                            width={16}
                            height={16}
                            className="rounded-full"
                          />
                          <span>{position.name}</span>
                          <span>
                            {Number(formatUnits(p.debtAmount, position.decimals)).toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="pt-2">
                <button
                  className={`btn btn-ghost w-full h-10 ${loading ? "animate-pulse" : ""}`}
                  onClick={step === "done" ? onClose : handleMovePosition}
                  disabled={step === "done" ? false : isActionDisabled}
                >
                  {loading && <span className="loading loading-spinner loading-sm mr-2"></span>}
                  {actionButtonText}
                </button>
              </div>
            </div>
          </div>
      </div>

      <form
        method="dialog"
        className="modal-backdrop backdrop-blur-sm bg-black/20"
        onClick={loading ? undefined : onClose}
      >
        <button disabled={loading}>close</button>
      </form>
    </dialog>
  );
};

type CollateralSwapPlannerRowProps = {
  collateral: CollateralWithAmount;
  selection: TargetCollateralOption | null;
  options: TargetCollateralOption[];
  hasOptions: boolean;
  selectPlaceholder: string;
  isCompatibilityLoading: boolean;
  selectedProtocol?: string;
  onSelect: (address: string) => void;
  userAddress?: `0x${string}`;
  chainId?: bigint;
  onPlanChange: (plan: CollateralSwapPlan | null) => void;
};

const CollateralSwapPlannerRow: FC<CollateralSwapPlannerRowProps> = ({
  collateral,
  selection,
  options,
  hasOptions,
  selectPlaceholder,
  isCompatibilityLoading,
  selectedProtocol,
  onSelect,
  userAddress,
  chainId,
  onPlanChange,
}) => {
  const normalizedChainId = typeof chainId === "bigint" ? Number(chainId) : chainId ?? 0;
  const enabled = Boolean(selection && userAddress && normalizedChainId > 0 && collateral.amount > 0n);

  const { status, data, error, refetchNow } = useSwapQuote({
    chainId: normalizedChainId,
    fromToken: collateral.token as `0x${string}`,
    toToken: selection?.address as `0x${string}`,
    amount: collateral.amount,
    takerAddress: userAddress,
    enabled,
    slippageBps: Number(SWAP_SLIPPAGE_BPS),
  });

  useEffect(() => {
    if (!selection || !enabled) {
      onPlanChange(null);
      return;
    }

    const errorMessage =
      status === "error"
        ? error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Failed to prepare swap quote"
        : null;

    onPlanChange({
      target: selection,
      status,
      quote: data ?? null,
      error: errorMessage,
    });
  }, [data, enabled, error, onPlanChange, selection, status]);

  const formattedSourceAmount = formatUnits(collateral.amount, collateral.decimals);
  const formattedTargetAmount =
    data && selection
      ? formatUnits(data.rawQuote.buyAmount, selection.decimals ?? collateral.decimals)
      : null;

  const showInitialLoading = status === "loading" && !data;
  const showUpdating = status === "loading" && !!data;
  const showStale = status === "stale";
  const errorMessage =
    status === "error"
      ? error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Failed to prepare swap quote"
      : null;

  return (
    <div className="rounded-md border border-warning/40 bg-base-100/60 p-3 text-xs space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <div className="relative h-5 w-5">
            <Image
              src={tokenNameToLogo(collateral.symbol)}
              alt={collateral.symbol}
              fill
              className="rounded-full object-contain"
            />
          </div>
          <span className="font-medium">{collateral.symbol}</span>
          <span className="text-base-content/70">
            {Number(formattedSourceAmount || 0).toLocaleString(undefined, {
              maximumFractionDigits: 6,
            })}
          </span>
        </div>
        <span className="text-warning-700">→</span>
        <select
          className="select select-bordered select-xs md:select-sm"
          value={selection?.address ?? ""}
          onChange={event => onSelect(event.target.value)}
          disabled={!hasOptions || isCompatibilityLoading}
        >
          <option value="">{selectPlaceholder}</option>
          {options.map(option => (
            <option key={option.address} value={option.address}>
              {option.symbol}
            </option>
          ))}
        </select>
      </div>

      {showInitialLoading && (
        <div className="flex items-center gap-2 text-warning-700">
          <span className="loading loading-spinner loading-xs" /> Preparing swap route…
        </div>
      )}

      {showUpdating && (
        <div className="flex items-center gap-2 text-warning-700">
          <span className="loading loading-spinner loading-xs" /> Updating swap route…
        </div>
      )}

      {showStale && (
        <div className="flex items-center gap-2 text-warning-700">
          <span className="loading loading-spinner loading-xs" /> Using cached route, refreshing…
        </div>
      )}

      {errorMessage && (
        <div className="flex flex-wrap items-center gap-2 text-error">
          <span>{errorMessage}</span>
          <button type="button" className="underline" onClick={refetchNow}>
            Retry
          </button>
        </div>
      )}

      {data && selection && status !== "error" && (
        <div className="flex flex-wrap items-center gap-1 text-base-content/70">
          <span>Swap ready:</span>
          <span className="font-medium">{formattedSourceAmount}</span>
          <span>{collateral.symbol}</span>
          <span>→</span>
          <span className="font-medium">{formattedTargetAmount}</span>
          <span>{selection.symbol}</span>
        </div>
      )}

      {!selection && hasOptions && !isCompatibilityLoading && (
        <div className="text-warning-800">Select a supported collateral to enable moving this debt pair.</div>
      )}

      {!hasOptions && !isCompatibilityLoading && (
        <div className="text-warning-800">
          No compatible collateral is available in {selectedProtocol}. Choose a different target protocol.
        </div>
      )}
    </div>
  );
};

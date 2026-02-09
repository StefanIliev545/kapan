"use client";

import { FC, useState, useMemo, useCallback, useEffect, useRef } from "react";
import { formatUnits } from "viem";
import { useReadContracts } from "wagmi";
import { Spinner } from "@radix-ui/themes";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useTokenSelectModal } from "./common/useTokenSelectModal";
import {
  TokenListItem,
  TokenListContainer,
  TokenSelectModalShell,
} from "./common/TokenListItem";
import { BorrowModal } from "./BorrowModal";
import { DepositAndBorrowModal } from "./DepositAndBorrowModal";
import { buildModalTokenInfo } from "./common/modalUtils";
import { encodeEulerContext } from "~~/utils/v2/instructionHelpers";
import { PositionManager } from "~~/utils/position";
import { useEulerVaultsQuery } from "~~/utils/euler/vaultApi";
import { useWalletTokenBalances } from "~~/hooks/useWalletTokenBalances";

/** ABI for on-chain Euler vault LTV queries */
const EULER_LTV_ABI = [
  {
    name: "LTVBorrow",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "collateral", type: "address" }],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    name: "LTVLiquidation",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "collateral", type: "address" }],
    outputs: [{ name: "", type: "uint16" }],
  },
] as const;

/** Collateral data passed from parent */
interface CollateralData {
  vaultAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  /** Raw balance in token units */
  balance: bigint;
  /** Token price with 8 decimals (from price feed) */
  priceRaw: bigint;
}

interface EulerBorrowModalProps {
  isOpen: boolean;
  onClose: () => void;
  chainId: number;
  /** The collateral vault addresses the user has deposits in */
  collateralVaultAddresses: string[];
  /** The sub-account index for this position */
  subAccountIndex: number;
  /** Detailed collateral data including balances and prices */
  collateralData?: CollateralData[];
  /** When true, user has no collateral deposited yet — after selecting a borrow vault,
   *  show a collateral picker then open DepositAndBorrowModal instead of BorrowModal */
  needsCollateral?: boolean;
  /** Pre-select a borrow vault by address (skips vault selector, goes straight to collateral picker).
   *  Only effective when needsCollateral=true. */
  defaultBorrowVault?: string | null;
}

interface BorrowVaultOption {
  vaultAddress: string;
  vaultSymbol: string;
  tokenSymbol: string;
  tokenAddress: string;
  tokenDecimals: number;
  borrowApy: number;
  totalSupply: string;
}

/**
 * Modal for initiating a borrow on Euler V2 when user has collateral but no debt.
 *
 * This modal:
 * 1. Shows available vaults that accept the user's collateral
 * 2. Allows selecting a vault to borrow from
 * 3. Opens BorrowModal with the correct Euler context
 *
 * When `defaultBorrowVault` is provided (and `needsCollateral=true`), vault selection is
 * skipped and the collateral picker is shown immediately.
 */
export const EulerBorrowModal: FC<EulerBorrowModalProps> = ({
  isOpen,
  onClose,
  chainId,
  collateralVaultAddresses,
  subAccountIndex,
  collateralData = [],
  needsCollateral = false,
  defaultBorrowVault = null,
}) => {
  // State for tracking which borrow vault is selected
  const [selectedBorrowVault, setSelectedBorrowVault] = useState<string | null>(null);
  // State for collateral selection step (needsCollateral mode)
  const [selectedCollateralVault, setSelectedCollateralVault] = useState<string | null>(null);
  const [showCollateralPicker, setShowCollateralPicker] = useState(false);

  // Track opening edge to apply defaultBorrowVault only once per open
  const wasOpenRef = useRef(false);
  const didApplyDefaultRef = useRef(false);

  // Use the shared token select modal hook (used in normal/non-needsCollateral mode)
  const {
    selectedToken,
    isActionModalOpen,
    handleSelectToken,
    handleActionModalClose,
    handleDone,
    reset: resetTokenSelect,
  } = useTokenSelectModal<BorrowVaultOption>({ onClose });

  // Reset all internal state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedBorrowVault(null);
      setSelectedCollateralVault(null);
      setShowCollateralPicker(false);
      resetTokenSelect();
      wasOpenRef.current = false;
      didApplyDefaultRef.current = false;
    }
  }, [isOpen, resetTokenSelect]);

  // Fetch all vaults to find ones that accept user's collateral
  const { data: allVaults = [], isLoading: isLoadingVaults } = useEulerVaultsQuery(chainId, {
    enabled: isOpen && !!chainId,
  });

  // Apply defaultBorrowVault when modal opens and vaults are loaded
  useEffect(() => {
    if (isOpen && !isLoadingVaults && allVaults.length > 0 && !didApplyDefaultRef.current) {
      if (needsCollateral && defaultBorrowVault) {
        // Verify the default vault exists in the available vaults
        const vaultExists = allVaults.some(
          v => v.address.toLowerCase() === defaultBorrowVault.toLowerCase(),
        );
        if (vaultExists) {
          setSelectedBorrowVault(defaultBorrowVault);
          setShowCollateralPicker(true);
          didApplyDefaultRef.current = true;
        }
      }
      wasOpenRef.current = true;
    }
  }, [isOpen, isLoadingVaults, allVaults, needsCollateral, defaultBorrowVault]);

  // Find vaults that accept at least one of the user's collateral vaults.
  // In needsCollateral mode (no existing collateral), show all vaults with collateral support.
  const availableBorrowVaults = useMemo(() => {
    if (!needsCollateral && !collateralVaultAddresses.length) return [];

    const userCollateralsLower = new Set(
      collateralVaultAddresses.map(a => a.toLowerCase())
    );

    const borrowVaults: BorrowVaultOption[] = [];

    for (const vault of allVaults) {
      const acceptedCollaterals = vault.collaterals || [];
      if (needsCollateral && collateralVaultAddresses.length === 0) {
        // Show all vaults that have at least one accepted collateral
        if (acceptedCollaterals.length > 0) {
          borrowVaults.push({
            vaultAddress: vault.address,
            vaultSymbol: vault.symbol,
            tokenSymbol: vault.asset.symbol,
            tokenAddress: vault.asset.address,
            tokenDecimals: vault.asset.decimals,
            borrowApy: vault.borrowApy,
            totalSupply: vault.totalSupply,
          });
        }
      } else {
        // Check if this vault accepts any of the user's collaterals
        const hasMatchingCollateral = acceptedCollaterals.some(
          col => userCollateralsLower.has(col.vaultAddress.toLowerCase())
        );

        if (hasMatchingCollateral) {
          borrowVaults.push({
            vaultAddress: vault.address,
            vaultSymbol: vault.symbol,
            tokenSymbol: vault.asset.symbol,
            tokenAddress: vault.asset.address,
            tokenDecimals: vault.asset.decimals,
            borrowApy: vault.borrowApy,
            totalSupply: vault.totalSupply,
          });
        }
      }
    }

    return borrowVaults;
  }, [allVaults, collateralVaultAddresses, needsCollateral]);

  // Sort by borrow APY (lowest first - best for borrowers)
  const sortedBorrowVaults = useMemo(
    () => [...availableBorrowVaults].sort((a, b) => a.borrowApy - b.borrowApy),
    [availableBorrowVaults]
  );

  // Get ALL collateral vaults that the borrow vault accepts from user's collaterals
  // This ensures sufficient LTV by enabling all available collaterals
  const getMatchingCollateralVaults = useCallback((borrowVaultAddress: string): string[] => {
    const borrowVault = allVaults.find(
      v => v.address.toLowerCase() === borrowVaultAddress.toLowerCase()
    );
    if (!borrowVault) return [];

    const userCollateralsLower = new Set(
      collateralVaultAddresses.map(a => a.toLowerCase())
    );

    const matchingVaults: string[] = [];
    const acceptedCollaterals = borrowVault.collaterals || [];

    for (const col of acceptedCollaterals) {
      if (userCollateralsLower.has(col.vaultAddress.toLowerCase())) {
        matchingVaults.push(col.vaultAddress);
      }
    }
    return matchingVaults;
  }, [allVaults, collateralVaultAddresses]);

  // Handle vault selection
  const handleSelectVault = useCallback(
    (vault: BorrowVaultOption) => {
      setSelectedBorrowVault(vault.vaultAddress);
      if (needsCollateral) {
        // In needsCollateral mode, show collateral picker instead of BorrowModal
        setShowCollateralPicker(true);
      } else {
        handleSelectToken(vault);
      }
    },
    [handleSelectToken, needsCollateral]
  );

  // Factory for vault click handlers
  const createVaultClickHandler = useCallback(
    (vault: BorrowVaultOption) => () => handleSelectVault(vault),
    [handleSelectVault]
  );

  // Build token info for the borrow modal (normal mode — uses useTokenSelectModal's selectedToken)
  const selectedTokenInfo = selectedToken
    ? buildModalTokenInfo({
        name: selectedToken.tokenSymbol,
        icon: tokenNameToLogo(selectedToken.tokenSymbol.toLowerCase()),
        tokenAddress: selectedToken.tokenAddress,
        currentRate: selectedToken.borrowApy * 100, // Convert to percentage
        usdPrice: 0, // Will be fetched by BorrowModal
        tokenDecimals: selectedToken.tokenDecimals,
      })
    : null;

  // Build debt token info for DepositAndBorrowModal (needsCollateral mode).
  // In this mode, useTokenSelectModal's selectedToken is never set because
  // handleSelectVault calls setShowCollateralPicker instead of handleSelectToken.
  // Also used when defaultBorrowVault is provided (vault picked from allVaults directly).
  const borrowVaultTokenInfo = useMemo(() => {
    if (!needsCollateral || !selectedBorrowVault) return null;
    // Look in sortedBorrowVaults first (normal flow), fall back to allVaults (defaultBorrowVault flow)
    let vault = sortedBorrowVaults.find(
      v => v.vaultAddress.toLowerCase() === selectedBorrowVault.toLowerCase(),
    );
    if (!vault) {
      const raw = allVaults.find(
        v => v.address.toLowerCase() === selectedBorrowVault.toLowerCase(),
      );
      if (!raw) return null;
      vault = {
        vaultAddress: raw.address,
        vaultSymbol: raw.symbol,
        tokenSymbol: raw.asset.symbol,
        tokenAddress: raw.asset.address,
        tokenDecimals: raw.asset.decimals,
        borrowApy: raw.borrowApy,
        totalSupply: raw.totalSupply,
      };
    }
    return buildModalTokenInfo({
      name: vault.tokenSymbol,
      icon: tokenNameToLogo(vault.tokenSymbol.toLowerCase()),
      tokenAddress: vault.tokenAddress,
      currentRate: vault.borrowApy * 100,
      usdPrice: 0, // DepositAndBorrowModal fetches price independently
      tokenDecimals: vault.tokenDecimals,
    });
  }, [needsCollateral, selectedBorrowVault, sortedBorrowVaults, allVaults]);

  // Build the Euler context for the borrow
  const eulerContext = useMemo(() => {
    if (!selectedBorrowVault) return undefined;

    // Get collaterals that the borrow vault accepts from user's collaterals
    const collateralVaults = getMatchingCollateralVaults(selectedBorrowVault);
    if (collateralVaults.length === 0) return undefined;

    return encodeEulerContext({
      borrowVault: selectedBorrowVault,
      collateralVault: collateralVaults,
      subAccountIndex,
    });
  }, [selectedBorrowVault, getMatchingCollateralVaults, subAccountIndex]);

  // ── Fetch on-chain LTV for all accepted collateral vaults ─────
  // Build multicall contracts for LTVBorrow and LTVLiquidation per collateral
  const ltvContracts = useMemo(() => {
    if (!selectedBorrowVault) return [];
    const borrowVault = allVaults.find(
      v => v.address.toLowerCase() === selectedBorrowVault.toLowerCase(),
    );
    if (!borrowVault) return [];

    const contracts: Array<{
      address: `0x${string}`;
      abi: typeof EULER_LTV_ABI;
      functionName: "LTVBorrow" | "LTVLiquidation";
      args: [`0x${string}`];
      chainId: number;
    }> = [];

    for (const col of borrowVault.collaterals || []) {
      contracts.push({
        address: selectedBorrowVault as `0x${string}`,
        abi: EULER_LTV_ABI,
        functionName: "LTVBorrow",
        args: [col.vaultAddress as `0x${string}`],
        chainId,
      });
      contracts.push({
        address: selectedBorrowVault as `0x${string}`,
        abi: EULER_LTV_ABI,
        functionName: "LTVLiquidation",
        args: [col.vaultAddress as `0x${string}`],
        chainId,
      });
    }
    return contracts;
  }, [selectedBorrowVault, allVaults, chainId]);

  const { data: ltvResults } = useReadContracts({
    contracts: ltvContracts,
    query: { enabled: ltvContracts.length > 0 },
  });

  // Parse LTV results into a map: collateralVault -> { borrowLtvBps, liquidationLtvBps }
  const collateralLtvMap = useMemo(() => {
    const map = new Map<string, { borrowLtvBps: number; liquidationLtvBps: number }>();
    if (!ltvResults || !selectedBorrowVault) return map;

    const borrowVault = allVaults.find(
      v => v.address.toLowerCase() === selectedBorrowVault.toLowerCase(),
    );
    if (!borrowVault) return map;

    const collaterals = borrowVault.collaterals || [];
    for (let i = 0; i < collaterals.length; i++) {
      const borrowIdx = i * 2;
      const liqIdx = i * 2 + 1;
      const borrowResult = ltvResults[borrowIdx];
      const liqResult = ltvResults[liqIdx];

      // Euler returns uint16 in 1e4 scale (e.g., 7500 = 75%)
      // Convert to bps by multiplying by 100/100 = already in bps
      const borrowLtvBps = borrowResult?.status === "success" ? Number(borrowResult.result) : 7500;
      const liquidationLtvBps = liqResult?.status === "success" ? Number(liqResult.result) : 8500;

      map.set(collaterals[i].vaultAddress.toLowerCase(), {
        borrowLtvBps,
        liquidationLtvBps,
      });
    }
    return map;
  }, [ltvResults, selectedBorrowVault, allVaults]);

  // Calculate total collateral USD value and create PositionManager
  // This enables proper LTV calculations in the BorrowModal
  const position = useMemo(() => {
    if (!selectedBorrowVault || collateralData.length === 0) return undefined;

    // Get matching collateral vaults for the selected borrow vault
    const matchingVaults = getMatchingCollateralVaults(selectedBorrowVault);
    const matchingVaultsLower = new Set(matchingVaults.map(v => v.toLowerCase()));

    // Calculate total collateral value in USD from matching collaterals only
    let totalCollateralUsd = 0;
    for (const col of collateralData) {
      if (!matchingVaultsLower.has(col.vaultAddress.toLowerCase())) continue;
      const balanceFloat = Number(col.balance) / (10 ** col.tokenDecimals);
      const priceFloat = Number(col.priceRaw) / 1e8;
      totalCollateralUsd += balanceFloat * priceFloat;
    }

    if (totalCollateralUsd <= 0) return undefined;

    // Use on-chain LTV from the first matching collateral (weighted average would be more accurate
    // but this matches the single-collateral common case)
    const firstMatch = matchingVaults[0]?.toLowerCase();
    const ltvData = firstMatch ? collateralLtvMap.get(firstMatch) : undefined;
    const ltvBps = ltvData?.borrowLtvBps ?? 7500;

    return new PositionManager(totalCollateralUsd, 0, ltvBps);
  }, [selectedBorrowVault, collateralData, getMatchingCollateralVaults, collateralLtvMap]);

  const emptyMessage = collateralVaultAddresses.length > 0
    ? "No vaults accept your collateral for borrowing"
    : needsCollateral ? "No borrow vaults available" : "No collateral deposited";

  // Whether we should show the vault picker (not when defaultBorrowVault skipped it)
  const showVaultPicker = isOpen && !isLoadingVaults && !showCollateralPicker && !selectedCollateralVault
    && !(needsCollateral && didApplyDefaultRef.current);

  // --- needsCollateral mode: collateral picker and DepositAndBorrowModal ---

  // Available collateral vaults for the selected borrow vault (needsCollateral mode)
  // Resolves decimals by looking up the collateral vault in allVaults
  const acceptedCollateralOptions = useMemo(() => {
    if (!needsCollateral || !selectedBorrowVault) return [];
    const borrowVault = allVaults.find(
      v => v.address.toLowerCase() === selectedBorrowVault.toLowerCase(),
    );
    if (!borrowVault) return [];

    const vaultLookup = new Map(allVaults.map(v => [v.address.toLowerCase(), v]));

    return (borrowVault.collaterals || [])
      .map(col => {
        const colVault = vaultLookup.get(col.vaultAddress.toLowerCase());
        const tokenAddress = col.tokenAddress || colVault?.asset.address || "";
        // Filter out collaterals with unresolvable token addresses
        if (!tokenAddress) return null;
        // Use on-chain LTV data if available, fall back to defaults
        const ltvData = collateralLtvMap.get(col.vaultAddress.toLowerCase());
        return {
          vaultAddress: col.vaultAddress,
          tokenSymbol: col.tokenSymbol || colVault?.asset.symbol || "???",
          tokenAddress,
          tokenDecimals: colVault?.asset.decimals ?? 18,
          ltvBps: ltvData?.borrowLtvBps ?? 7500,
          lltvBps: ltvData?.liquidationLtvBps ?? 8500,
        };
      })
      .filter((col): col is NonNullable<typeof col> => col !== null);
  }, [needsCollateral, selectedBorrowVault, allVaults, collateralLtvMap]);

  // Fetch wallet balances for collateral tokens in the picker (needsCollateral mode)
  const collateralTokenInputs = useMemo(
    () => acceptedCollateralOptions.map(col => ({ address: col.tokenAddress, decimals: col.tokenDecimals })),
    [acceptedCollateralOptions],
  );
  const { balances: collateralWalletBalances } = useWalletTokenBalances({
    tokens: collateralTokenInputs,
    network: "evm",
    chainId,
  });

  const handleSelectCollateral = useCallback((collateralVaultAddr: string) => {
    setSelectedCollateralVault(collateralVaultAddr);
    setShowCollateralPicker(false);
  }, []);

  const handleCloseCollateralPicker = useCallback(() => {
    setShowCollateralPicker(false);
    setSelectedBorrowVault(null);
    // If we came from defaultBorrowVault, close the whole modal
    if (didApplyDefaultRef.current) {
      onClose();
    }
  }, [onClose]);

  const handleCloseDepositAndBorrow = useCallback(() => {
    setSelectedCollateralVault(null);
    setSelectedBorrowVault(null);
    onClose();
  }, [onClose]);

  // Build context and token info for DepositAndBorrowModal
  const depositBorrowContext = useMemo(() => {
    if (!selectedBorrowVault || !selectedCollateralVault) return undefined;
    return encodeEulerContext({
      borrowVault: selectedBorrowVault,
      collateralVault: [selectedCollateralVault],
      subAccountIndex,
    });
  }, [selectedBorrowVault, selectedCollateralVault, subAccountIndex]);

  const selectedCollateralOption = useMemo(
    () => acceptedCollateralOptions.find(c => c.vaultAddress === selectedCollateralVault),
    [acceptedCollateralOptions, selectedCollateralVault],
  );

  const depositCollateralTokenInfo = useMemo(() => {
    if (!selectedCollateralOption) return null;
    return buildModalTokenInfo({
      name: selectedCollateralOption.tokenSymbol,
      icon: tokenNameToLogo(selectedCollateralOption.tokenSymbol.toLowerCase()),
      tokenAddress: selectedCollateralOption.tokenAddress,
      currentRate: 0,
      usdPrice: 0,
      tokenDecimals: selectedCollateralOption.tokenDecimals,
    });
  }, [selectedCollateralOption]);

  /** Format wallet balance for display in the collateral picker */
  const formatCollateralBalance = useCallback((col: typeof acceptedCollateralOptions[number]): string => {
    const entry = collateralWalletBalances[col.tokenAddress.toLowerCase()];
    if (!entry) return "";
    const formatted = formatUnits(entry.balance, entry.decimals ?? col.tokenDecimals);
    const num = parseFloat(formatted);
    if (num === 0) return "Bal: 0";
    return `Bal: ${num < 0.0001 ? "<0.0001" : num.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
  }, [collateralWalletBalances]);

  return (
    <>
      {/* Loading state while vaults are being fetched */}
      {isOpen && isLoadingVaults && (
        <TokenSelectModalShell
          isOpen
          isActionModalOpen={false}
          onClose={onClose}
          title="Select Borrow Asset"
        >
          <div className="flex items-center justify-center py-8">
            <Spinner size="2" />
            <span className="text-base-content/50 ml-2 text-sm">Loading vaults...</span>
          </div>
        </TokenSelectModalShell>
      )}

      {/* Step 1: Select borrow vault (skipped when defaultBorrowVault is applied) */}
      <TokenSelectModalShell
        isOpen={showVaultPicker}
        isActionModalOpen={isActionModalOpen}
        onClose={handleDone}
        title="Select Borrow Asset"
      >
        <TokenListContainer isEmpty={sortedBorrowVaults.length === 0} emptyMessage={emptyMessage}>
          {sortedBorrowVaults.map(vault => (
            <TokenListItem
              key={vault.vaultAddress}
              name={vault.tokenSymbol}
              icon={tokenNameToLogo(vault.tokenSymbol.toLowerCase())}
              rate={vault.borrowApy}
              rateLabel="APR"
              rateDecimals={2}
              rateIsRaw={false}
              balanceLabel={`TVL: ${formatUnits(BigInt(Math.floor(parseFloat(vault.totalSupply) * 1e6)), 6)}`}
              onClick={createVaultClickHandler(vault)}
            />
          ))}
        </TokenListContainer>
      </TokenSelectModalShell>

      {/* Step 2a (needsCollateral): Select collateral vault to deposit */}
      {needsCollateral && (
        <TokenSelectModalShell
          isOpen={showCollateralPicker}
          isActionModalOpen={false}
          onClose={handleCloseCollateralPicker}
          title="Select Collateral to Deposit"
        >
          <TokenListContainer isEmpty={acceptedCollateralOptions.length === 0} emptyMessage="No accepted collaterals">
            {acceptedCollateralOptions.map(col => (
              <TokenListItem
                key={col.vaultAddress}
                name={col.tokenSymbol}
                icon={tokenNameToLogo(col.tokenSymbol.toLowerCase())}
                rate={col.ltvBps / 100}
                rateLabel="Max LTV"
                rateDecimals={1}
                rateIsRaw={false}
                balanceLabel={formatCollateralBalance(col)}
                onClick={() => handleSelectCollateral(col.vaultAddress)}
              />
            ))}
          </TokenListContainer>
        </TokenSelectModalShell>
      )}

      {/* Step 2b (needsCollateral): DepositAndBorrowModal */}
      {needsCollateral && depositCollateralTokenInfo && borrowVaultTokenInfo && depositBorrowContext && (
        <DepositAndBorrowModal
          isOpen={!!selectedCollateralVault}
          onClose={handleCloseDepositAndBorrow}
          protocolName="Euler"
          chainId={chainId}
          collateralToken={depositCollateralTokenInfo}
          debtToken={borrowVaultTokenInfo}
          context={depositBorrowContext}
          maxLtvBps={selectedCollateralOption?.ltvBps}
          lltvBps={selectedCollateralOption?.lltvBps}
        />
      )}

      {/* Step 2 (normal mode): Borrow Modal for the selected vault */}
      {!needsCollateral && selectedTokenInfo && eulerContext && (
        <BorrowModal
          isOpen={isActionModalOpen}
          onClose={handleActionModalClose}
          token={selectedTokenInfo}
          protocolName="Euler"
          currentDebt={0}
          chainId={chainId}
          context={eulerContext}
          position={position}
        />
      )}
    </>
  );
};

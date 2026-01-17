"use client";

import { FC, useState, useMemo, useCallback } from "react";
import { formatUnits } from "viem";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useTokenSelectModal } from "./common/useTokenSelectModal";
import {
  TokenListItem,
  TokenListContainer,
  TokenSelectModalShell,
} from "./common/TokenListItem";
import { BorrowModal } from "./BorrowModal";
import { buildModalTokenInfo } from "./common/modalUtils";
import { encodeEulerContext } from "~~/utils/v2/instructionHelpers";
import { PositionManager } from "~~/utils/position";
import { useEulerVaultsQuery } from "~~/utils/euler/vaultApi";

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
 */
export const EulerBorrowModal: FC<EulerBorrowModalProps> = ({
  isOpen,
  onClose,
  chainId,
  collateralVaultAddresses,
  subAccountIndex,
  collateralData = [],
}) => {
  // State for tracking which borrow vault is selected
  const [selectedBorrowVault, setSelectedBorrowVault] = useState<string | null>(null);

  // Use the shared token select modal hook
  const {
    selectedToken,
    isActionModalOpen,
    handleSelectToken,
    handleActionModalClose,
    handleDone,
  } = useTokenSelectModal<BorrowVaultOption>({ onClose });

  // Fetch all vaults to find ones that accept user's collateral
  const { data: allVaults = [], isLoading: isLoadingVaults } = useEulerVaultsQuery(chainId, {
    enabled: isOpen && !!chainId,
  });

  // Find vaults that accept at least one of the user's collateral vaults
  // These are vaults where the user can borrow from
  const availableBorrowVaults = useMemo(() => {
    if (!collateralVaultAddresses.length) return [];

    const userCollateralsLower = new Set(
      collateralVaultAddresses.map(a => a.toLowerCase())
    );

    const borrowVaults: BorrowVaultOption[] = [];

    for (const vault of allVaults) {
      // Check if this vault accepts any of the user's collaterals
      const acceptedCollaterals = vault.collaterals || [];
      const hasMatchingCollateral = acceptedCollaterals.some(
        col => userCollateralsLower.has(col.vaultAddress.toLowerCase())
      );

      if (hasMatchingCollateral) {
        // This vault can be used for borrowing with the user's collateral
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

    return borrowVaults;
  }, [allVaults, collateralVaultAddresses]);

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
    if (!borrowVault) {
      console.log("[EulerBorrowModal] Borrow vault not found in allVaults:", borrowVaultAddress);
      return [];
    }

    const userCollateralsLower = new Set(
      collateralVaultAddresses.map(a => a.toLowerCase())
    );

    // Return ALL user collaterals that this borrow vault accepts
    const matchingVaults: string[] = [];
    const acceptedCollaterals = borrowVault.collaterals || [];
    console.log("[EulerBorrowModal] Borrow vault accepted collaterals:", acceptedCollaterals.length);
    console.log("[EulerBorrowModal] User collaterals:", collateralVaultAddresses);

    for (const col of acceptedCollaterals) {
      if (userCollateralsLower.has(col.vaultAddress.toLowerCase())) {
        matchingVaults.push(col.vaultAddress);
      }
    }
    console.log("[EulerBorrowModal] Matching collaterals:", matchingVaults);
    return matchingVaults;
  }, [allVaults, collateralVaultAddresses]);

  // Handle vault selection
  const handleSelectVault = useCallback(
    (vault: BorrowVaultOption) => {
      setSelectedBorrowVault(vault.vaultAddress);
      handleSelectToken(vault);
    },
    [handleSelectToken]
  );

  // Factory for vault click handlers
  const createVaultClickHandler = useCallback(
    (vault: BorrowVaultOption) => () => handleSelectVault(vault),
    [handleSelectVault]
  );

  // Build token info for the borrow modal
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

  // Build the Euler context for the borrow
  const eulerContext = useMemo(() => {
    if (!selectedBorrowVault) return undefined;

    // Get collaterals that the borrow vault accepts from user's collaterals
    const collateralVaults = getMatchingCollateralVaults(selectedBorrowVault);
    if (collateralVaults.length === 0) {
      console.log("[EulerBorrowModal] No matching collaterals for borrow vault");
      return undefined;
    }

    console.log("[EulerBorrowModal] Encoding context with collaterals:", collateralVaults);
    return encodeEulerContext({
      borrowVault: selectedBorrowVault,
      collateralVault: collateralVaults, // Pass matching collaterals
      subAccountIndex,
    });
  }, [selectedBorrowVault, getMatchingCollateralVaults, subAccountIndex]);

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
      // Only include collaterals that the borrow vault accepts
      if (!matchingVaultsLower.has(col.vaultAddress.toLowerCase())) continue;

      // Price is in 8 decimals, balance is in token decimals
      // USD value = (balance / 10^decimals) * (price / 10^8)
      const balanceFloat = Number(col.balance) / (10 ** col.tokenDecimals);
      const priceFloat = Number(col.priceRaw) / 1e8;
      totalCollateralUsd += balanceFloat * priceFloat;
    }

    if (totalCollateralUsd <= 0) return undefined;

    // Use a conservative default max LTV (75% = 7500 bps) for Euler
    // This is a reasonable estimate; actual LTV varies by collateral
    const defaultLtvBps = 7500;

    console.log("[EulerBorrowModal] Creating PositionManager:", {
      totalCollateralUsd,
      borrowedUsd: 0,
      ltvBps: defaultLtvBps,
    });

    // No existing debt since this modal is for positions without debt
    return new PositionManager(totalCollateralUsd, 0, defaultLtvBps);
  }, [selectedBorrowVault, collateralData, getMatchingCollateralVaults]);

  const emptyMessage = collateralVaultAddresses.length > 0
    ? "No vaults accept your collateral for borrowing"
    : "No collateral deposited";

  return (
    <>
      <TokenSelectModalShell
        isOpen={isOpen && !isLoadingVaults}
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

      {/* Borrow Modal for the selected vault */}
      {selectedTokenInfo && eulerContext && (
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

"use client";

import { FC, useState, useMemo, useCallback } from "react";
import { formatUnits } from "viem";
import { useQuery } from "@tanstack/react-query";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useWalletTokenBalances, normalizeAddress } from "~~/hooks/useWalletTokenBalances";
import { useTokenSelectModal } from "./common/useTokenSelectModal";
import {
  TokenListItem,
  TokenListContainer,
  TokenSelectModalShell,
} from "./common/TokenListItem";
import { DepositModal } from "./DepositModal";
import { buildModalTokenInfo } from "./common/modalUtils";
import { encodeEulerContext } from "~~/utils/v2/instructionHelpers";
import type { EulerVaultResponse } from "~~/app/api/euler/[chainId]/vaults/route";

interface AddEulerCollateralModalProps {
  isOpen: boolean;
  onClose: () => void;
  chainId: number;
  /** The borrow vault address for this position */
  borrowVaultAddress: string;
  /** Existing collateral vault addresses (to exclude from selection) */
  existingCollateralVaults: string[];
}

interface CollateralOption {
  vaultAddress: string;
  vaultSymbol: string;
  tokenSymbol: string;
  tokenAddress: string;
  tokenDecimals: number;
  supplyApy: number;
}

// Fetch vaults from API
async function fetchEulerVaults(chainId: number): Promise<EulerVaultResponse[]> {
  try {
    const response = await fetch(`/api/euler/${chainId}/vaults?first=500`);
    if (!response.ok) return [];
    const data = await response.json();
    return data?.vaults || [];
  } catch {
    return [];
  }
}

export const AddEulerCollateralModal: FC<AddEulerCollateralModalProps> = ({
  isOpen,
  onClose,
  chainId,
  borrowVaultAddress,
  existingCollateralVaults,
}) => {
  // State for tracking which collateral vault is selected (for context encoding)
  const [selectedCollateralVault, setSelectedCollateralVault] = useState<string | null>(null);

  // Use the shared token select modal hook
  const {
    selectedToken,
    isActionModalOpen,
    handleSelectToken,
    handleActionModalClose,
    handleDone,
  } = useTokenSelectModal<CollateralOption>({ onClose });

  // Fetch all vaults to get collateral info
  const { data: allVaults = [], isLoading: isLoadingVaults } = useQuery({
    queryKey: ["euler-vaults-add-collateral", chainId],
    queryFn: () => fetchEulerVaults(chainId),
    enabled: isOpen && !!chainId,
    staleTime: 5 * 60 * 1000,
  });

  // Find the borrow vault and its accepted collaterals
  const availableCollaterals = useMemo(() => {
    const borrowAddr = borrowVaultAddress.toLowerCase();
    const bVault = allVaults.find(v => v.address.toLowerCase() === borrowAddr);

    if (!bVault) {
      return [];
    }

    // Get accepted collateral vaults
    const acceptedCollaterals = bVault.collaterals || [];
    const existingSet = new Set(existingCollateralVaults.map(a => a.toLowerCase()));

    // Filter out existing collaterals and map to full info
    const available: CollateralOption[] = [];
    for (const col of acceptedCollaterals) {
      if (existingSet.has(col.vaultAddress.toLowerCase())) continue;

      // Find full vault info
      const vaultInfo = allVaults.find(
        v => v.address.toLowerCase() === col.vaultAddress.toLowerCase()
      );

      if (vaultInfo) {
        available.push({
          vaultAddress: col.vaultAddress,
          vaultSymbol: col.vaultSymbol,
          tokenSymbol: col.tokenSymbol || vaultInfo.asset.symbol,
          tokenAddress: vaultInfo.asset.address,
          tokenDecimals: vaultInfo.asset.decimals,
          supplyApy: vaultInfo.supplyApy || 0,
        });
      }
    }

    return available;
  }, [allVaults, borrowVaultAddress, existingCollateralVaults]);

  // Fetch wallet balances for all available collateral tokens
  const tokensForBalance = useMemo(
    () => availableCollaterals.map(col => ({
      address: col.tokenAddress,
      decimals: col.tokenDecimals,
    })),
    [availableCollaterals]
  );

  const { balances } = useWalletTokenBalances({
    tokens: tokensForBalance,
    network: "evm",
    chainId,
  });

  // Build collaterals with balance info
  const collateralsWithBalance = useMemo(
    () =>
      availableCollaterals.map(col => {
        const key = normalizeAddress(col.tokenAddress);
        const balanceInfo = balances[key];
        const rawBalance = balanceInfo?.balance ?? 0n;
        const balance = Number(formatUnits(rawBalance, col.tokenDecimals));

        return {
          ...col,
          formattedBalance: balance,
          hasBalance: rawBalance > 0n,
          balanceLabel: balance.toLocaleString("en-US", {
            maximumFractionDigits: 6,
          }),
        };
      }),
    [availableCollaterals, balances]
  );

  // Sort by balance (highest first)
  const sortedCollaterals = useMemo(
    () => [...collateralsWithBalance].sort((a, b) => {
      if (a.hasBalance && !b.hasBalance) return -1;
      if (!a.hasBalance && b.hasBalance) return 1;
      return b.formattedBalance - a.formattedBalance;
    }),
    [collateralsWithBalance]
  );

  // Handle token selection - also track the collateral vault
  const handleSelectCollateral = useCallback(
    (collateral: CollateralOption) => {
      setSelectedCollateralVault(collateral.vaultAddress);
      handleSelectToken(collateral);
    },
    [handleSelectToken]
  );

  // Factory for token click handlers
  const createTokenClickHandler = useCallback(
    (token: CollateralOption) => () => handleSelectCollateral(token),
    [handleSelectCollateral]
  );

  // Build token info for the deposit modal
  const selectedTokenInfo = selectedToken
    ? buildModalTokenInfo({
        name: selectedToken.tokenSymbol,
        icon: tokenNameToLogo(selectedToken.tokenSymbol.toLowerCase()),
        tokenAddress: selectedToken.tokenAddress,
        currentRate: selectedToken.supplyApy * 100, // Convert to percentage
        usdPrice: 0, // Will be fetched by DepositModal
        tokenDecimals: selectedToken.tokenDecimals,
      })
    : null;

  // Build the Euler context for the deposit
  const eulerContext = useMemo(() => {
    if (!selectedCollateralVault) return undefined;
    return encodeEulerContext({
      borrowVault: borrowVaultAddress,
      collateralVault: selectedCollateralVault,
    });
  }, [borrowVaultAddress, selectedCollateralVault]);

  const emptyMessage = existingCollateralVaults.length > 0
    ? "All accepted collaterals are already in use"
    : "No accepted collaterals found";

  return (
    <>
      <TokenSelectModalShell
        isOpen={isOpen && !isLoadingVaults}
        isActionModalOpen={isActionModalOpen}
        onClose={handleDone}
        title="Add Collateral"
      >
        <TokenListContainer isEmpty={sortedCollaterals.length === 0} emptyMessage={emptyMessage}>
          {sortedCollaterals.map(token => (
            <TokenListItem
              key={token.vaultAddress}
              name={token.tokenSymbol}
              icon={tokenNameToLogo(token.tokenSymbol.toLowerCase())}
              rate={token.supplyApy}
              rateLabel="APY"
              rateDecimals={2}
              rateIsRaw={false}
              balanceLabel={token.balanceLabel}
              onClick={createTokenClickHandler(token)}
            />
          ))}
        </TokenListContainer>
      </TokenSelectModalShell>

      {/* Deposit Modal for the selected collateral */}
      {selectedTokenInfo && (
        <DepositModal
          isOpen={isActionModalOpen}
          onClose={handleActionModalClose}
          token={selectedTokenInfo}
          protocolName="Euler"
          chainId={chainId}
          context={eulerContext}
        />
      )}
    </>
  );
};

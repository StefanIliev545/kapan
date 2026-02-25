"use client";

import { FC, useState, useMemo, useCallback } from "react";
import { formatUnits } from "viem";
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
import { useEulerVaultsQuery } from "~~/utils/euler/vaultApi";

interface AddEulerCollateralModalProps {
  isOpen: boolean;
  onClose: () => void;
  chainId: number;
  /** The borrow vault address for this position (undefined for supply-only sub-accounts) */
  borrowVaultAddress?: string;
  /** Existing collateral vault addresses (to exclude from selection) */
  existingCollateralVaults: string[];
  /** Custom modal title */
  title?: string;
  /** Sub-account index (for supply-only context encoding) */
  subAccountIndex?: number;
}

interface CollateralOption {
  vaultAddress: string;
  vaultSymbol: string;
  tokenSymbol: string;
  tokenAddress: string;
  tokenDecimals: number;
  supplyApy: number;
}

export const AddEulerCollateralModal: FC<AddEulerCollateralModalProps> = ({
  isOpen,
  onClose,
  chainId,
  borrowVaultAddress,
  existingCollateralVaults,
  title = "Add Collateral",
  subAccountIndex,
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
  const { data: allVaults = [], isLoading: isLoadingVaults } = useEulerVaultsQuery(chainId, {
    enabled: isOpen && !!chainId,
  });

  // Find available vaults to deposit into.
  // With debt: show accepted collaterals of the borrow vault (excluding existing ones).
  // Without debt (supply-only): show all vaults (excluding existing ones).
  const availableCollaterals = useMemo(() => {
    const existingSet = new Set(existingCollateralVaults.map(a => a.toLowerCase()));

    if (borrowVaultAddress) {
      // With debt: filter to accepted collaterals of the borrow vault
      const borrowAddr = borrowVaultAddress.toLowerCase();
      const bVault = allVaults.find(v => v.address.toLowerCase() === borrowAddr);
      if (!bVault) return [];

      const acceptedCollaterals = bVault.collaterals || [];
      const available: CollateralOption[] = [];
      for (const col of acceptedCollaterals) {
        if (existingSet.has(col.vaultAddress.toLowerCase())) continue;
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
    }

    // Without debt: show all vaults not already in this sub-account
    const available: CollateralOption[] = [];
    for (const vault of allVaults) {
      if (existingSet.has(vault.address.toLowerCase())) continue;
      // Skip vaults with no meaningful supply APY info (likely inactive)
      available.push({
        vaultAddress: vault.address,
        vaultSymbol: vault.symbol || vault.asset.symbol,
        tokenSymbol: vault.asset.symbol,
        tokenAddress: vault.asset.address,
        tokenDecimals: vault.asset.decimals,
        supplyApy: vault.supplyApy || 0,
      });
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
    // For supply-only sub-accounts, use the vault itself as both borrow and collateral context
    const borrowVault = borrowVaultAddress || selectedCollateralVault;
    return encodeEulerContext({
      borrowVault,
      collateralVault: selectedCollateralVault,
      subAccountIndex,
    });
  }, [borrowVaultAddress, selectedCollateralVault, subAccountIndex]);

  const emptyMessage = existingCollateralVaults.length > 0
    ? borrowVaultAddress
      ? "All accepted collaterals are already in use"
      : "All available vaults are already in use"
    : "No available vaults found";

  return (
    <>
      <TokenSelectModalShell
        isOpen={isOpen && !isLoadingVaults}
        isActionModalOpen={isActionModalOpen}
        onClose={handleDone}
        title={title}
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

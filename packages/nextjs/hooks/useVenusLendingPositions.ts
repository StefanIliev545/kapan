import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import type { ProtocolPosition } from "~~/components/ProtocolView";
import type { SupplyPositionProps } from "~~/components/SupplyPosition";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldReadContract, useScaffoldContract } from "~~/hooks/scaffold-eth";
import { useProtocolTotalsFromPositions } from "~~/hooks/common";
import { filterPositionsByWalletStatus } from "~~/utils/tokenSymbols";

// ── Types ──────────────────────────────────────────────────────────

export interface VenusLendingResult {
  suppliedPositions: SupplyPositionProps[];
  borrowedPositions: ProtocolPosition[];
  forceShowAll: boolean;
  hasLoadedOnce: boolean;
  isLoading: boolean;
  /** Comptroller address for VenusMarketEntry (collateral toggle) */
  comptrollerAddress: string | undefined;
  /** vToken addresses for market-entry UI */
  vTokenAddresses: readonly string[] | undefined;
}

// ── Constants ──────────────────────────────────────────────────────

/** Token address → display name and logo overrides */
const TOKEN_OVERRIDES: Record<string, { name: string; logo: string }> = {
  "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336": { name: "gmWETH/USDC", logo: "/logos/gmweth.svg" },
  "0x47c031236e19d024b42f8AE6780E44A573170703": { name: "gmWBTC/USDC", logo: "/logos/gmbtc.svg" },
};

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Convert Venus per-block rate to APY percentage.
 * Venus uses rates per block (1 sec blocks on BNB Chain).
 * Following: https://docs-v4.venus.io/guides/protocol-math#calculating-the-apy-using-rate-per-block
 */
function venusRateToAPY(ratePerBlock: bigint): number {
  const ethMantissa = 1e18;
  const blocksPerDay = 60 * 60 * 24;
  const daysPerYear = 365;

  const ratePerBlockNum = Number(ratePerBlock) / ethMantissa;
  const apy = (Math.pow((ratePerBlockNum * blocksPerDay) + 1, daysPerYear - 1) - 1) * 100;
  return apy;
}

function getTokenDisplay(tokenAddress: string, originalSymbol: string) {
  const override = TOKEN_OVERRIDES[tokenAddress];
  if (override) {
    return { displayName: override.name, logo: override.logo };
  }
  return { displayName: originalSymbol, logo: tokenNameToLogo(originalSymbol) };
}

// ── Hook ────────────────────────────────────────────────────────────

/**
 * Data-fetching hook for Venus Protocol positions.
 *
 * Combines multiple contract calls (getAllMarkets, getAllVenusMarkets,
 * getMarketRates, getUserBalances, getCollateralStatus) and converts
 * Venus per-block rates to APY.
 *
 * Extracted from VenusProtocolView to allow use in topology-based rendering.
 */
export function useVenusLendingPositions(chainId?: number): VenusLendingResult {
  const { address: connectedAddress } = useAccount();

  const { data: gateway } = useScaffoldContract({ contractName: "VenusGatewayView", chainId: chainId as any });
  const comptrollerAddress = useMemo(() => gateway?.address as string | undefined, [gateway]);

  const isWalletConnected = !!connectedAddress;
  const forceShowAll = !isWalletConnected;

  // Step 1: Get vToken addresses
  const { data: vTokenAddresses, isLoading: isLoadingVTokens } = useScaffoldReadContract({
    contractName: "VenusGatewayView",
    functionName: "getAllMarkets",
    chainId: chainId as any,
  });

  // Step 2: Get detailed market information including prices from oracles
  const { data: marketDetails, isLoading: isLoadingMarketDetails } = useScaffoldReadContract({
    contractName: "VenusGatewayView",
    functionName: "getAllVenusMarkets",
    chainId: chainId as any,
  });

  // Step 3: Get market rates after we have vToken addresses
  const { data: ratesData, isLoading: isLoadingRates } = useScaffoldReadContract({
    contractName: "VenusGatewayView",
    functionName: "getMarketRates",
    args: [vTokenAddresses],
    chainId: chainId as any,
  });

  // Step 4: Get user balances if wallet is connected
  const { data: userBalances, isLoading: isLoadingBalances } = useScaffoldReadContract({
    contractName: "VenusGatewayView",
    functionName: "getUserBalances",
    args: [vTokenAddresses, connectedAddress],
    chainId: chainId as any,
  });

  // Step 5: Get collateral status if wallet is connected
  const { data: collateralStatus, isLoading: isLoadingCollateral } = useScaffoldReadContract({
    contractName: "VenusGatewayView",
    functionName: "getCollateralStatus",
    args: [vTokenAddresses, connectedAddress],
    chainId: chainId as any,
  });

  // Track first load
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    setHasLoadedOnce(false);
  }, [chainId]);

  const isLoading = isLoadingVTokens || isLoadingMarketDetails || isLoadingRates ||
    (!!connectedAddress && (isLoadingBalances || isLoadingCollateral));

  useEffect(() => {
    if (!isLoading && !hasLoadedOnce && vTokenAddresses && marketDetails && ratesData) {
      setHasLoadedOnce(true);
    }
  }, [isLoading, hasLoadedOnce, vTokenAddresses, marketDetails, ratesData]);

  // Combine all data into positions
  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    const supplied: SupplyPositionProps[] = [];
    const borrowed: ProtocolPosition[] = [];

    if (!vTokenAddresses || !marketDetails || !ratesData || (connectedAddress && (!userBalances || !collateralStatus))) {
      return { suppliedPositions: supplied, borrowedPositions: borrowed };
    }

    const [vTokens, tokens, symbols, , decimals, prices] = marketDetails;
    const [, supplyRates, borrowRates] = ratesData;

    for (let i = 0; i < vTokens.length; i++) {
      const symbol = symbols[i];
      const decimal = decimals[i];
      const tokenAddress = tokens[i];

      // Skip tokens with no underlying
      if (tokenAddress === "0x0000000000000000000000000000000000000000") continue;

      const { displayName, logo } = getTokenDisplay(tokenAddress, symbol);

      const supplyAPY = venusRateToAPY(supplyRates[i]);
      const borrowAPY = venusRateToAPY(borrowRates[i]);

      // Venus oracle prices: USD with scale factor of 1e18
      const tokenPrice = Number(formatUnits(prices[i], 18 + (18 - decimal)));

      // Supply position
      let supplyBalance = 0n;
      let supplyUsdBalance = 0;
      if (userBalances) {
        const [balances] = userBalances;
        supplyBalance = balances[i];
        const supplyFormatted = Number(formatUnits(supplyBalance, decimal));
        supplyUsdBalance = supplyFormatted * tokenPrice;
      }

      const priceWith8Decimals = BigInt(Math.round(tokenPrice * 1e8));

      supplied.push({
        icon: logo,
        name: displayName,
        balance: supplyUsdBalance,
        tokenBalance: supplyBalance,
        currentRate: supplyAPY,
        tokenAddress,
        tokenPrice: priceWith8Decimals,
        usdPrice: tokenPrice,
        tokenDecimals: Number(decimal),
        tokenSymbol: symbol,
        protocolName: "Venus",
        networkType: "evm",
      });

      // Borrow position
      let borrowBalance = 0n;
      let borrowUsdBalance = 0;
      if (userBalances) {
        const [, borrowBalances] = userBalances;
        borrowBalance = borrowBalances[i];
        const borrowFormatted = Number(formatUnits(borrowBalance, decimal));
        borrowUsdBalance = borrowFormatted * tokenPrice;
      }

      borrowed.push({
        icon: logo,
        name: displayName,
        balance: -borrowUsdBalance,
        tokenBalance: borrowBalance,
        currentRate: borrowAPY,
        tokenAddress,
        tokenPrice: priceWith8Decimals,
        usdPrice: tokenPrice,
        tokenDecimals: Number(decimal),
        tokenSymbol: symbol,
      });
    }

    return { suppliedPositions: supplied, borrowedPositions: borrowed };
  }, [vTokenAddresses, marketDetails, ratesData, userBalances, collateralStatus, connectedAddress]);

  const filteredSupplied = filterPositionsByWalletStatus(
    suppliedPositions as SupplyPositionProps[],
    isWalletConnected,
  );
  const filteredBorrowed = filterPositionsByWalletStatus(borrowedPositions, isWalletConnected);

  // Determine if data is ready for totals calculation
  const isDataReady = !!(
    vTokenAddresses &&
    marketDetails &&
    ratesData &&
    !isLoadingVTokens &&
    !isLoadingMarketDetails &&
    !isLoadingRates &&
    (!connectedAddress || (!isLoadingBalances && !isLoadingCollateral))
  );

  // Report totals to global state
  useProtocolTotalsFromPositions(
    "Venus",
    filteredSupplied,
    filteredBorrowed,
    isDataReady,
  );

  return {
    suppliedPositions: filteredSupplied,
    borrowedPositions: filteredBorrowed,
    forceShowAll,
    hasLoadedOnce,
    isLoading,
    comptrollerAddress,
    vTokenAddresses: vTokenAddresses as readonly string[] | undefined,
  };
}

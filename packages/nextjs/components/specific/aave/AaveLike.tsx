import { FC, useEffect, useMemo, useState } from "react";
import { ProtocolPosition } from "../../ProtocolView";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import type { ContractName } from "~~/utils/scaffold-eth/contract";
import { useProtocolTotalsFromPositions } from "~~/hooks/common";
import { aaveRateToAPY } from "~~/utils/protocolRates";
import { filterPositionsByWalletStatus } from "~~/utils/tokenSymbols";

interface AaveLikeProps {
  chainId?: number;
  contractName: "AaveGatewayView" | "ZeroLendGatewayView" | "SparkGatewayView";
  children: (props: {
    suppliedPositions: ProtocolPosition[];
    borrowedPositions: ProtocolPosition[];
    forceShowAll: boolean;
    hasLoadedOnce: boolean;
  }) => React.ReactNode;
}

/**
 * AaveLike component - handles data fetching and processing for Aave-like protocols.
 * This component is protocol-agnostic and doesn't include protocol names or icons.
 * It fetches data from the specified contract and processes it into positions.
 */
export const AaveLike: FC<AaveLikeProps> = ({ chainId, contractName, children }) => {
  const { address: connectedAddress } = useAccount();

  // Type assertion needed because ZeroLendGatewayView may not be in ContractName yet
  // Extract to variable to help TypeScript with type inference
  const contractNameTyped = contractName as any as ContractName;

  // Get the gateway view contract info to use its address as a fallback
  const { data: contractInfo } = useDeployedContractInfo({ 
    contractName: contractNameTyped, 
    chainId: chainId as any 
  });

  const isWalletConnected = !!connectedAddress;
  const forceShowAll = !isWalletConnected;

  // Determine the address to use for queries - use contract's own address as fallback
  const queryAddress = connectedAddress || contractInfo?.address;


  // Track whether we've loaded data at least once
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Reset hasLoadedOnce when chainId changes
  useEffect(() => {
    setHasLoadedOnce(false);
  }, [chainId]);

  // Get all token info, including supply and borrow balances, using query address
  const { data: allTokensInfo } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: contractNameTyped,
    functionName: "getAllTokensInfo",
    args: [queryAddress],
    chainId,
  });

  // Track first successful load (when data becomes available)
  useEffect(() => {
    if (allTokensInfo && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [allTokensInfo, hasLoadedOnce]);

  // Aggregate positions by iterating over the returned tokens.
  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    const supplied: ProtocolPosition[] = [];
    const borrowed: ProtocolPosition[] = [];

    if (!allTokensInfo) return { suppliedPositions: supplied, borrowedPositions: borrowed };

    allTokensInfo.forEach((token: any) => {
      // Prefer on-chain decimals provided by the gateway; fallback for legacy deployments
      let decimals = typeof token.decimals !== "undefined" ? Number(token.decimals) : 18;
      if (typeof token.decimals === "undefined") {
        if (token.symbol === "USDC" || token.symbol === "USD₮0" || token.symbol === "USDC.e") {
          decimals = 6;
        }
      }

      const supplyAPY = aaveRateToAPY(token.supplyRate);
      const borrowAPY = aaveRateToAPY(token.borrowRate);
      const tokenPrice = Number(formatUnits(token.price, 8));

      // Add supply position
      const supplyBalance = token.balance ? Number(formatUnits(token.balance, decimals)) : 0;
      const supplyUsdBalance = supplyBalance * tokenPrice;
      supplied.push({
        icon: tokenNameToLogo(token.symbol),
        name: token.symbol,
        balance: supplyUsdBalance,
        tokenBalance: token.balance,
        currentRate: supplyAPY,
        tokenAddress: token.token,
        tokenPrice: token.price,
        usdPrice: tokenPrice,
        tokenDecimals: decimals,
        tokenSymbol: token.symbol,
      });

      // Add borrow position
      const borrowBalance = token.borrowBalance ? Number(formatUnits(token.borrowBalance, decimals)) : 0;
      const borrowUsdBalance = borrowBalance * tokenPrice;
      borrowed.push({
        icon: tokenNameToLogo(token.symbol),
        name: token.symbol,
        balance: -borrowUsdBalance,
        tokenBalance: token.borrowBalance,
        currentRate: borrowAPY,
        tokenAddress: token.token,
        tokenPrice: token.price,
        usdPrice: tokenPrice,
        tokenDecimals: decimals,
        tokenSymbol: token.symbol,
      });
    });

    return { suppliedPositions: supplied, borrowedPositions: borrowed };
  }, [allTokensInfo]);

  const filteredSuppliedPositions = filterPositionsByWalletStatus(suppliedPositions, isWalletConnected);
  const filteredBorrowedPositions = filterPositionsByWalletStatus(borrowedPositions, isWalletConnected);

  // Derive protocol name from contract name
  const protocolName = contractName === "ZeroLendGatewayView" ? "ZeroLend" : contractName === "SparkGatewayView" ? "Spark" : "Aave";

  // Use the shared hook to update protocol totals in global state
  useProtocolTotalsFromPositions(
    protocolName,
    filteredSuppliedPositions,
    filteredBorrowedPositions,
    !!allTokensInfo
  );

  return <>{children({ suppliedPositions: filteredSuppliedPositions, borrowedPositions: filteredBorrowedPositions, forceShowAll, hasLoadedOnce })}</>;
};


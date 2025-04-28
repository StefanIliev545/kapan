import { FC, useMemo, useState, useEffect } from "react";
import { ProtocolPosition, ProtocolView } from "../../ProtocolView";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";

export const AaveProtocolView: FC = () => {
  const { address: connectedAddress } = useAccount();
  
  // Get the AaveGateway contract info to use its address as a fallback
  const { data: contractInfo } = useDeployedContractInfo({ contractName: "AaveGateway" });
  
  // State to track if we should force showing all assets when wallet is not connected
  const [forceShowAll, setForceShowAll] = useState(false);
  
  // Determine the address to use for queries - use contract's own address as fallback
  const queryAddress = connectedAddress || contractInfo?.address;
  
  // Update forceShowAll when wallet connection status changes with a delay
  useEffect(() => {
    // If wallet is connected, immediately set forceShowAll to false
    if (connectedAddress) {
      setForceShowAll(false);
      return;
    }
    
    // If wallet is not connected, wait a bit before forcing show all
    // This gives time for wallet to connect during initial page load
    const timeout = setTimeout(() => {
      if (!connectedAddress) {
        setForceShowAll(true);
      }
    }, 2500); // Wait 2.5 seconds before deciding wallet is not connected
    
    return () => clearTimeout(timeout);
  }, [connectedAddress]);

  // Helper: Convert Aave RAY (1e27) rates to APY percentage.
  const convertRateToAPY = (rate: bigint): number => Number(rate) / 1e25;

  // Get all token info, including supply and borrow balances, using query address
  const { data: allTokensInfo } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "AaveGateway",
    functionName: "getAllTokensInfo",
    args: [queryAddress],
  });

  // Aggregate positions by iterating over the returned tokens.
  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    const supplied: ProtocolPosition[] = [];
    const borrowed: ProtocolPosition[] = [];

    if (!allTokensInfo) return { suppliedPositions: supplied, borrowedPositions: borrowed };

    allTokensInfo.forEach((token: any) => {
      let decimals = 18;
      if (token.symbol === "USDC" || token.symbol === "USD₮0" || token.symbol === "USDC.e") {
        decimals = 6;
      }

      const supplyAPY = convertRateToAPY(token.supplyRate);
      const borrowAPY = convertRateToAPY(token.borrowRate);
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
        tokenSymbol: token.symbol,
      });
    });

    return { suppliedPositions: supplied, borrowedPositions: borrowed };
  }, [allTokensInfo]);

  return (
    <ProtocolView
      protocolName="Aave V3"
      protocolIcon="/logos/aave.svg"
      ltv={75}
      maxLtv={90}
      suppliedPositions={suppliedPositions}
      borrowedPositions={borrowedPositions}
      forceShowAll={forceShowAll}
      networkType="evm"
    />
  );
};

export default AaveProtocolView;

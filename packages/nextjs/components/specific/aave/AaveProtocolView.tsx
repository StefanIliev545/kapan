import { FC, useMemo, useState, useEffect } from "react";
import { ProtocolPosition, ProtocolView } from "../../ProtocolView";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldReadContract, useDeployedContractInfo } from "~~/hooks/scaffold-eth";

export const AaveProtocolView: FC = () => {
  const { address: connectedAddress } = useAccount();
  
  // Get the AaveGateway contract info to use its address as a fallback
  const { data: contractInfo } = useDeployedContractInfo({ contractName: "AaveGateway" });
  
  // State to track if we should force showing all assets when wallet is not connected
  const [forceShowAll, setForceShowAll] = useState(false);
  
  // Determine the address to use for queries - use contract's own address as fallback
  const queryAddress = connectedAddress || contractInfo?.address;
  
  // Update forceShowAll when wallet connection status changes
  useEffect(() => {
    setForceShowAll(!connectedAddress);
  }, [connectedAddress]);

  // Helper: Convert Aave RAY (1e27) rates to APY percentage.
  const convertRateToAPY = (rate: bigint): number => Number(rate) / 1e25;

  // Get all token info, including supply and borrow balances, using query address
  const { data: allTokensInfo } = useScaffoldReadContract({
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
      if (token.symbol === "USDC" || token.symbol === "USDT" || token.symbol === "USDC.e") {
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
    />
  );
};

export default AaveProtocolView;

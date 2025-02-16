import { FC, useMemo } from "react";
import { ProtocolPosition, ProtocolView } from "../../ProtocolView";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

export const AaveProtocolView: FC = () => {
  const { address: connectedAddress } = useAccount();

  // Helper: Convert Aave RAY (1e27) rates to APY percentage.
  const convertRateToAPY = (rate: bigint): number => Number(rate) / 1e25;

  // Get all token info, including supply and borrow balances, for the connected user.
  const { data: allTokensInfo } = useScaffoldReadContract({
    contractName: "AaveGateway",
    functionName: "getAllTokensInfo",
    args: [connectedAddress],
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
        tokenBalance: supplyBalance,
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
        tokenBalance: borrowBalance,
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
    />
  );
};

export default AaveProtocolView;

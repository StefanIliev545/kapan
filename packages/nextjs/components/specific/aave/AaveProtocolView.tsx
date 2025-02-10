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
      // Determine decimals based on the token symbol.
      // Adjust this logic as needed for your tokens.
      let decimals = 18;
      if (token.symbol === "USDC" || token.symbol === "USDT" || token.symbol === "USDC.e") {
        decimals = 6;
      }

      const supplyAPY = convertRateToAPY(token.supplyRate);
      const borrowAPY = convertRateToAPY(token.borrowRate);

      // If the user has a supplied (deposited) balance, compute its USD value.
      if (token.balance && BigInt(token.balance) > 0n) {
        const usdBalance = Number(formatUnits(token.price, 8)) * Number(formatUnits(token.balance, decimals));
        supplied.push({
          icon: tokenNameToLogo(token.symbol),
          name: token.symbol,
          balance: usdBalance,
          currentRate: supplyAPY,
          optimalRate: supplyAPY,
        });
      }

      // If the user has a borrow balance, compute its USD value.
      if (token.borrowBalance && BigInt(token.borrowBalance) > 0n) {
        const usdBalance = Number(formatUnits(token.price, 8)) * Number(formatUnits(token.borrowBalance, decimals));
        borrowed.push({
          icon: tokenNameToLogo(token.symbol),
          name: token.symbol,
          balance: -usdBalance,
          currentRate: borrowAPY,
          optimalRate: borrowAPY,
        });
      }
    });

    return { suppliedPositions: supplied, borrowedPositions: borrowed };
  }, [allTokensInfo]);

  return (
    <ProtocolView
      protocolName="Aave V3"
      protocolIcon="/logos/aave.svg"
      ltv={75} // Optionally, you could fetch this value from the contract.
      maxLtv={90} // Optionally, you could fetch this value from the contract.
      suppliedPositions={suppliedPositions}
      borrowedPositions={borrowedPositions}
    />
  );
};

export default AaveProtocolView;

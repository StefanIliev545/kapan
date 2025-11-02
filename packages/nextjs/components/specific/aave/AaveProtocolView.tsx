import { FC, useMemo } from "react";
import { ProtocolPosition, ProtocolView } from "../../ProtocolView";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";

export const AaveProtocolView: FC = () => {
  const { address: connectedAddress } = useAccount();

  // Get the AaveGatewayView contract info to use its address as a fallback
  const { data: contractInfo } = useDeployedContractInfo({ contractName: "AaveGatewayView" });

  const isWalletConnected = !!connectedAddress;
  const forceShowAll = !isWalletConnected;

  // Determine the address to use for queries - use contract's own address as fallback
  const queryAddress = connectedAddress || contractInfo?.address;

  // Helper: Convert Aave RAY (1e27) rates to APY percentage.
  const convertRateToAPY = (rate: bigint): number => Number(rate) / 1e25;

  // Get all token info, including supply and borrow balances, using query address
  const { data: allTokensInfo } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "AaveGatewayView",
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
        tokenDecimals: decimals,
        tokenSymbol: token.symbol,
      });
    });

    return { suppliedPositions: supplied, borrowedPositions: borrowed };
  }, [allTokensInfo]);

  const tokenFilter = ["BTC", "ETH", "USDC", "USDT"];
  const sanitize = (name: string) => name.replace("₮", "T").replace(/[^a-zA-Z]/g, "").toUpperCase();

  const filteredSuppliedPositions = isWalletConnected
    ? suppliedPositions
    : suppliedPositions.filter(p => tokenFilter.includes(sanitize(p.name)));
  const filteredBorrowedPositions = isWalletConnected
    ? borrowedPositions
    : borrowedPositions.filter(p => tokenFilter.includes(sanitize(p.name)));

  return (
    <ProtocolView
      protocolName="Aave V3"
      protocolIcon="/logos/aave.svg"
      ltv={75}
      maxLtv={90}
      suppliedPositions={filteredSuppliedPositions}
      borrowedPositions={filteredBorrowedPositions}
      forceShowAll={forceShowAll}
      networkType="evm"
    />
  );
};

export default AaveProtocolView;

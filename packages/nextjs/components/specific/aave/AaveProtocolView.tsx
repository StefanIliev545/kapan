import { FC, useMemo } from "react";
import { ProtocolPosition, ProtocolView } from "../../ProtocolView";
import { useAccount } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { useForceShowAll } from "~~/hooks/useForceShowAll";
import { buildProtocolPositions, convertAaveRate, TokenPositionInput } from "~~/utils/positions";

export const AaveProtocolView: FC = () => {
  const { address: connectedAddress, isConnected } = useAccount();

  // Get the AaveGateway contract info to use its address as a fallback
  const { data: contractInfo } = useDeployedContractInfo({ contractName: "AaveGateway" });

  // Determine if we should force showing all assets when wallet is not connected
  const forceShowAll = useForceShowAll(isConnected);

  // Determine the address to use for queries - use contract's own address as fallback
  const queryAddress = connectedAddress || contractInfo?.address;

  // Get all token info, including supply and borrow balances, using query address
  const { data: allTokensInfo } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "AaveGateway",
    functionName: "getAllTokensInfo",
    args: [queryAddress],
  });

  // Aggregate positions by iterating over the returned tokens.
  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    if (!allTokensInfo) {
      return { suppliedPositions: [] as ProtocolPosition[], borrowedPositions: [] as ProtocolPosition[] };
    }

    const tokens: TokenPositionInput[] = allTokensInfo.map((token: any) => {
      let decimals = 18;
      if (token.symbol === "USDC" || token.symbol === "USD₮0" || token.symbol === "USDC.e") {
        decimals = 6;
      }
      return {
        symbol: token.symbol,
        token: token.token,
        balance: token.balance,
        borrowBalance: token.borrowBalance,
        supplyRate: token.supplyRate,
        borrowRate: token.borrowRate,
        price: token.price,
        decimals,
      } as TokenPositionInput;
    });

    return buildProtocolPositions(tokens, convertAaveRate);
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

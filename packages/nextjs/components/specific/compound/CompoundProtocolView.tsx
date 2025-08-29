import { FC, useMemo } from "react";
import { ProtocolView } from "../../ProtocolView";
import { CompoundCollateralView } from "./CompoundCollateralView";
import { useAccount, useWalletClient } from "wagmi";
import { useScaffoldContract } from "~~/hooks/scaffold-eth";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";
import { useForceShowAll } from "~~/hooks/useForceShowAll";
import { buildProtocolPositions, convertCompoundRate, TokenPositionInput } from "~~/utils/positions";

// Define a constant for zero address
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const CompoundProtocolView: FC = () => {
  const { address: connectedAddress, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  // Determine if we should force showing all assets when wallet is not connected
  const forceShowAll = useForceShowAll(isConnected);

  // Determine the address to use for queries
  const queryAddress = connectedAddress || ZERO_ADDRESS;

  // Load token contracts via useScaffoldContract.
  const { data: usdc } = useScaffoldContract({ contractName: "USDC", walletClient });
  const { data: usdt } = useScaffoldContract({ contractName: "USDT", walletClient });
  const { data: usdcE } = useScaffoldContract({ contractName: "USDCe", walletClient });
  const { data: weth } = useScaffoldContract({ contractName: "eth", walletClient });

  // Extract token addresses.
  const wethAddress = weth?.address;
  const usdcAddress = usdc?.address;
  const usdtAddress = usdt?.address;
  const usdcEAddress = usdcE?.address;

  // For each token, call the aggregated getCompoundData function.
  // getCompoundData returns a tuple: [supplyRate, borrowRate, balance, borrowBalance]
  const { data: wethCompoundData } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "CompoundGateway",
    functionName: "getCompoundData",
    args: [wethAddress, queryAddress],
  });
  const { data: usdcCompoundData } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "CompoundGateway",
    functionName: "getCompoundData",
    args: [usdcAddress, queryAddress],
  });
  const { data: usdtCompoundData } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "CompoundGateway",
    functionName: "getCompoundData",
    args: [usdtAddress, queryAddress],
  });
  const { data: usdcECompoundData } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "CompoundGateway",
    functionName: "getCompoundData",
    args: [usdcEAddress, queryAddress],
  });

  // Fetch decimals for each token.
  const { data: wethDecimals } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "eth",
    functionName: "decimals",
  });
  const { data: usdcDecimals } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "USDC",
    functionName: "decimals",
  });
  const { data: usdtDecimals } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "USDT",
    functionName: "decimals",
  });
  const { data: usdcEDecimals } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "USDCe",
    functionName: "decimals",
  });

  // Aggregate positions using useMemo.
  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    const tokens: TokenPositionInput[] = [];

    const pushToken = (
      tokenName: string,
      tokenAddress: string | undefined,
      compoundData: any,
      decimalsRaw: any,
    ) => {
      if (!tokenAddress || !compoundData || !decimalsRaw) return;
      const [supplyRate, borrowRate, balanceRaw, borrowBalanceRaw, price] = compoundData;
      const decimals = Number(decimalsRaw);
      tokens.push({
        symbol: tokenName,
        token: tokenAddress,
        balance: balanceRaw,
        borrowBalance: borrowBalanceRaw,
        supplyRate: supplyRate ? BigInt(supplyRate) : 0n,
        borrowRate: borrowRate ? BigInt(borrowRate) : 0n,
        price,
        decimals,
        collateralView: (
          <CompoundCollateralView
            baseToken={tokenAddress}
            baseTokenDecimals={decimals}
            compoundData={compoundData}
          />
        ),
      });
    };

    pushToken("WETH", wethAddress, wethCompoundData, wethDecimals);
    pushToken("USDC", usdcAddress, usdcCompoundData, usdcDecimals);
    pushToken("USDT", usdtAddress, usdtCompoundData, usdtDecimals);
    pushToken("USDC.e", usdcEAddress, usdcECompoundData, usdcEDecimals);

    return buildProtocolPositions(tokens, convertCompoundRate);
  }, [
    wethAddress,
    wethCompoundData,
    wethDecimals,
    usdcAddress,
    usdcCompoundData,
    usdcDecimals,
    usdtAddress,
    usdtCompoundData,
    usdtDecimals,
    usdcEAddress,
    usdcECompoundData,
    usdcEDecimals,
  ]);

  // Hardcode current LTV (or fetch from contract if needed).
  const currentLtv = 75;

  return (
    <div>
      <ProtocolView
        protocolName="Compound V3"
        protocolIcon="/logos/compound.svg"
        ltv={currentLtv}
        maxLtv={90}
        suppliedPositions={suppliedPositions}
        borrowedPositions={borrowedPositions}
        hideUtilization={true}
        forceShowAll={forceShowAll}
        networkType="evm"
      />
    </div>
  );
};

export default CompoundProtocolView;

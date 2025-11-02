import { FC, useMemo } from "react";
import { ProtocolPosition, ProtocolView } from "../../ProtocolView";
import { CompoundCollateralView } from "./CompoundCollateralView";
import { formatUnits } from "viem";
import { useAccount, useWalletClient } from "wagmi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldContract, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useNetworkAwareReadContract } from "~~/hooks/useNetworkAwareReadContract";

// Define a constant for zero address
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const useCollateralValue = (baseToken?: string, userAddress?: string) => {
  const { data: collateralData } = useScaffoldReadContract({
    contractName: "CompoundGatewayView",
    functionName: "getDepositedCollaterals",
    args: [baseToken, userAddress],
    query: {
      enabled: !!baseToken && !!userAddress,
    },
  });

  const collateralAddresses = useMemo(
    () => (collateralData?.[0] as string[] | undefined) || [],
    [collateralData],
  );

  const { data: collateralPrices } = useScaffoldReadContract({
    contractName: "CompoundGatewayView",
    functionName: "getPrices",
    args: [baseToken, collateralAddresses],
    query: {
      enabled: !!baseToken && collateralAddresses.length > 0,
    },
  });

  const { data: collateralDecimals } = useScaffoldReadContract({
    contractName: "UiHelper",
    functionName: "getDecimals",
    args: [collateralAddresses],
    query: {
      enabled: collateralAddresses.length > 0,
    },
  });

  const { data: baseTokenPrice } = useScaffoldReadContract({
    contractName: "CompoundGatewayView",
    functionName: "getPrice",
    args: [baseToken],
    query: {
      enabled: !!baseToken,
    },
  });

  return useMemo(() => {
    if (!collateralData || !baseTokenPrice) return 0;

    const addresses = collateralData[0] as string[];
    const balances = collateralData[1] as bigint[];

    let total = 0;

    for (let i = 0; i < addresses.length; i++) {
      const balanceRaw = balances[i];
      const decimals =
        collateralDecimals && i < collateralDecimals.length ? Number(collateralDecimals[i]) : 18;
      const balance = Number(formatUnits(balanceRaw, decimals));
      const collateralPrice = collateralPrices && i < collateralPrices.length ? collateralPrices[i] : 0n;
      if (collateralPrice > 0n && baseTokenPrice > 0n) {
        const scaleFactor = 10n ** 8n;
        const usdPrice = (collateralPrice * baseTokenPrice) / scaleFactor;
        total += balance * Number(formatUnits(usdPrice, 8));
      }
    }

    return total;
  }, [collateralData, collateralPrices, collateralDecimals, baseTokenPrice]);
};

export const CompoundProtocolView: FC = () => {
  const { address: connectedAddress } = useAccount();
  const { data: walletClient } = useWalletClient();

  const isWalletConnected = !!connectedAddress;
  const forceShowAll = !isWalletConnected;

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
    contractName: "CompoundGatewayView",
    functionName: "getCompoundData",
    args: [wethAddress, queryAddress],
  });
  const { data: usdcCompoundData } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "CompoundGatewayView",
    functionName: "getCompoundData",
    args: [usdcAddress, queryAddress],
  });
  const { data: usdtCompoundData } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "CompoundGatewayView",
    functionName: "getCompoundData",
    args: [usdtAddress, queryAddress],
  });
  const { data: usdcECompoundData } = useNetworkAwareReadContract({
    networkType: "evm",
    contractName: "CompoundGatewayView",
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

  // Fetch total collateral value for each market
  const wethCollateralValue = useCollateralValue(wethAddress, queryAddress);
  const usdcCollateralValue = useCollateralValue(usdcAddress, queryAddress);
  const usdtCollateralValue = useCollateralValue(usdtAddress, queryAddress);
  const usdcECollateralValue = useCollateralValue(usdcEAddress, queryAddress);

  // Helper: Convert Compound's per-second rate to an APR percentage.
  const convertRateToAPR = (ratePerSecond: bigint): number => {
    const SECONDS_PER_YEAR = 60 * 60 * 24 * 365; // as a number
    const SCALE = 1e18; // as a number
    return (Number(ratePerSecond) * SECONDS_PER_YEAR * 100) / SCALE;
  };

  // Aggregate positions using useMemo.
  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    const supplied: ProtocolPosition[] = [];
    const borrowed: ProtocolPosition[] = [];

    const computePosition = (
      tokenName: string,
      tokenAddress: string | undefined,
      compoundData: any,
      decimalsRaw: any,
      collateralValue: number,
    ) => {
      if (!tokenAddress || !compoundData || !decimalsRaw) return;
      const [supplyRate, borrowRate, balanceRaw, borrowBalanceRaw, price, priceScale] = compoundData;
      const decimals = Number(decimalsRaw);
      const supplyAPR = supplyRate ? convertRateToAPR(BigInt(supplyRate)) : 0;
      const borrowAPR = borrowRate ? convertRateToAPR(BigInt(borrowRate)) : 0;

      const balance = balanceRaw ? Number(formatUnits(balanceRaw, decimals)) : 0;
      const usdBalance = balance * Number(formatUnits(price, 8));

      const borrowBalance = borrowBalanceRaw ? Number(formatUnits(borrowBalanceRaw, decimals)) : 0;
      const usdBorrowBalance = borrowBalance * Number(formatUnits(price, 8));

      // Always add to borrowed positions list, regardless of whether there's debt
      borrowed.push({
        icon: tokenNameToLogo(tokenName),
        name: tokenName,
        // Set negative balance if there's debt, otherwise zero balance
        balance: borrowBalanceRaw && borrowBalanceRaw > 0n ? -usdBorrowBalance : 0,
        collateralValue,
        tokenBalance: borrowBalanceRaw || 0n,
        currentRate: borrowAPR,
        tokenAddress: tokenAddress,
        tokenPrice: price,
        tokenDecimals: decimals,
        tokenSymbol: tokenName,
        collateralView: (
          <CompoundCollateralView baseToken={tokenAddress} baseTokenDecimals={decimals} compoundData={compoundData} />
        ),
      });

      supplied.push({
        icon: tokenNameToLogo(tokenName),
        name: tokenName,
        balance: usdBalance,
        tokenBalance: balanceRaw,
        currentRate: supplyAPR,
        tokenAddress: tokenAddress,
        tokenPrice: price,
        tokenDecimals: decimals,
        tokenSymbol: tokenName,
      });
    };

    computePosition("WETH", wethAddress, wethCompoundData, wethDecimals, wethCollateralValue);
    computePosition("USDC", usdcAddress, usdcCompoundData, usdcDecimals, usdcCollateralValue);
    computePosition("USDT", usdtAddress, usdtCompoundData, usdtDecimals, usdtCollateralValue);
    computePosition("USDC.e", usdcEAddress, usdcECompoundData, usdcEDecimals, usdcECollateralValue);

    return { suppliedPositions: supplied, borrowedPositions: borrowed };
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
    wethCollateralValue,
    usdcCollateralValue,
    usdtCollateralValue,
    usdcECollateralValue,
  ]);

  const tokenFilter = ["BTC", "ETH", "USDC", "USDT"];
  const sanitize = (name: string) => name.replace("₮", "T").replace(/[^a-zA-Z]/g, "").toUpperCase();

  const filteredSuppliedPositions = isWalletConnected
    ? suppliedPositions
    : suppliedPositions.filter(p => tokenFilter.includes(sanitize(p.name)));
  const filteredBorrowedPositions = isWalletConnected
    ? borrowedPositions
    : borrowedPositions.filter(p => tokenFilter.includes(sanitize(p.name)));

  // Hardcode current LTV (or fetch from contract if needed).
  const currentLtv = 75;

  return (
    <div>
      <ProtocolView
        protocolName="Compound V3"
        protocolIcon="/logos/compound.svg"
        ltv={currentLtv}
        maxLtv={90}
        suppliedPositions={filteredSuppliedPositions}
        borrowedPositions={filteredBorrowedPositions}
        hideUtilization={true}
        forceShowAll={forceShowAll}
        networkType="evm"
      />
    </div>
  );
};

export default CompoundProtocolView;

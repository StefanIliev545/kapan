import { FC, useMemo } from "react";
import { ProtocolPosition, ProtocolView } from "../../ProtocolView";
import { CompoundCollateralView } from "./CompoundCollateralView";
import { formatUnits } from "viem";
import { useAccount, useWalletClient } from "wagmi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldContract, useScaffoldReadContract } from "~~/hooks/scaffold-eth";

export const CompoundProtocolView: FC = () => {
  const { address: connectedAddress } = useAccount();
  const { data: walletClient } = useWalletClient();

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
  const { data: wethCompoundData } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getCompoundData",
    args: [wethAddress, connectedAddress],
  });
  const { data: usdcCompoundData } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getCompoundData",
    args: [usdcAddress, connectedAddress],
  });
  const { data: usdtCompoundData } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getCompoundData",
    args: [usdtAddress, connectedAddress],
  });
  const { data: usdcECompoundData } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getCompoundData",
    args: [usdcEAddress, connectedAddress],
  });

  // Fetch collateral data for each token to include in balance calculation
  const { data: wethCollateralData } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getDepositedCollaterals",
    args: [wethAddress, connectedAddress],
  });
  const { data: usdcCollateralData } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getDepositedCollaterals",
    args: [usdcAddress, connectedAddress],
  });
  const { data: usdtCollateralData } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getDepositedCollaterals",
    args: [usdtAddress, connectedAddress],
  });
  const { data: usdcECollateralData } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getDepositedCollaterals",
    args: [usdcEAddress, connectedAddress],
  });

  // Get collateral token addresses for price fetching
  const wethCollateralAddresses = useMemo(() => {
    if (!wethCollateralData?.[0] || !wethCollateralData[0].length) return [];
    return wethCollateralData[0];
  }, [wethCollateralData]);

  const usdcCollateralAddresses = useMemo(() => {
    if (!usdcCollateralData?.[0] || !usdcCollateralData[0].length) return [];
    return usdcCollateralData[0];
  }, [usdcCollateralData]);

  const usdtCollateralAddresses = useMemo(() => {
    if (!usdtCollateralData?.[0] || !usdtCollateralData[0].length) return [];
    return usdtCollateralData[0];
  }, [usdtCollateralData]);

  const usdcECollateralAddresses = useMemo(() => {
    if (!usdcECollateralData?.[0] || !usdcECollateralData[0].length) return [];
    return usdcECollateralData[0];
  }, [usdcECollateralData]);

  // Fetch prices for all collateral tokens
  const { data: wethCollateralPrices } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getPrices",
    args: [wethAddress, wethCollateralAddresses],
  });

  const { data: usdcCollateralPrices } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getPrices",
    args: [usdcAddress, usdcCollateralAddresses],
  });

  const { data: usdtCollateralPrices } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getPrices",
    args: [usdtAddress, usdtCollateralAddresses],
  });

  const { data: usdcECollateralPrices } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getPrices",
    args: [usdcEAddress, usdcECollateralAddresses],
  });

  // Get decimals for collateral tokens
  const { data: wethCollateralDecimals } = useScaffoldReadContract({
    contractName: "UiHelper",
    functionName: "getDecimals",
    args: [wethCollateralAddresses],
  });

  const { data: usdcCollateralDecimals } = useScaffoldReadContract({
    contractName: "UiHelper",
    functionName: "getDecimals",
    args: [usdcCollateralAddresses],
  });

  const { data: usdtCollateralDecimals } = useScaffoldReadContract({
    contractName: "UiHelper",
    functionName: "getDecimals",
    args: [usdtCollateralAddresses],
  });

  const { data: usdcECollateralDecimals } = useScaffoldReadContract({
    contractName: "UiHelper",
    functionName: "getDecimals",
    args: [usdcECollateralAddresses],
  });

  // Fetch decimals for each token.
  const { data: wethDecimals } = useScaffoldReadContract({
    contractName: "eth",
    functionName: "decimals",
  });
  const { data: usdcDecimals } = useScaffoldReadContract({
    contractName: "USDC",
    functionName: "decimals",
  });
  const { data: usdtDecimals } = useScaffoldReadContract({
    contractName: "USDT",
    functionName: "decimals",
  });
  const { data: usdcEDecimals } = useScaffoldReadContract({
    contractName: "USDCe",
    functionName: "decimals",
  });

  // Helper: Convert Compound's per-second rate to an APR percentage.
  const convertRateToAPR = (ratePerSecond: bigint): number => {
    const SECONDS_PER_YEAR = 60 * 60 * 24 * 365; // as a number
    const SCALE = 1e18; // as a number
    return (Number(ratePerSecond) * SECONDS_PER_YEAR * 100) / SCALE;
  };

  // Calculate total collateral value in USD for a specific market
  const calculateCollateralValue = (
    collateralData: any,
    collateralPrices: any,
    collateralDecimals: any
  ): number => {
    if (!collateralData || !collateralData[0] || !collateralData[0].length || !collateralPrices) {
      return 0;
    }

    const [addresses, balances, displayNames] = collateralData;
    let totalValue = 0;

    for (let i = 0; i < addresses.length; i++) {
      // Skip tokens with zero balance
      if (!balances[i] || balances[i] === 0n) continue;

      // Use the token's actual decimals if available, fallback to 18
      const decimals = collateralDecimals && i < collateralDecimals.length
        ? Number(collateralDecimals[i])
        : 18;

      // Format balance with proper decimals
      const balance = Number(formatUnits(balances[i], decimals));

      // Get price and ensure it exists
      if (!collateralPrices[i]) continue;
      
      // Price is in 8 decimals format
      const price = Number(formatUnits(collateralPrices[i], 8));
      
      const tokenValue = balance * price;
      totalValue += tokenValue;
    }

    return totalValue;
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
      marketCollateralData: any,
      marketCollateralPrices: any,
      marketCollateralDecimals: any
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

      // Calculate collateral value for this market
      const collateralValue = calculateCollateralValue(
        marketCollateralData,
        marketCollateralPrices,
        marketCollateralDecimals
      );

      console.log(`${tokenName} market:`, { 
        usdBorrowBalance, 
        collateralValue,
        netBalance: collateralValue - usdBorrowBalance 
      });

      // Always add to borrowed positions list, regardless of whether there's debt
      borrowed.push({
        icon: tokenNameToLogo(tokenName),
        name: tokenName,
        // Set negative balance if there's debt, otherwise zero balance
        balance: borrowBalanceRaw && borrowBalanceRaw > 0n ? -usdBorrowBalance : 0,
        // Store collateral value as a custom property
        collateralValue: collateralValue,
        tokenBalance: borrowBalanceRaw || 0n,
        currentRate: borrowAPR,
        tokenAddress: tokenAddress,
        collateralView: <CompoundCollateralView 
          baseToken={tokenAddress} 
          collateralData={marketCollateralData}
          collateralPrices={marketCollateralPrices}
          collateralDecimals={marketCollateralDecimals}
          baseTokenDecimals={decimals}
          compoundData={compoundData}
        />,
      });

      supplied.push({
        icon: tokenNameToLogo(tokenName),
        name: tokenName,
        balance: usdBalance,
        tokenBalance: balanceRaw,
        currentRate: supplyAPR,
        tokenAddress: tokenAddress,
      });
    };

    computePosition(
      "WETH", 
      wethAddress, 
      wethCompoundData, 
      wethDecimals,
      wethCollateralData,
      wethCollateralPrices,
      wethCollateralDecimals
    );
    computePosition(
      "USDC", 
      usdcAddress, 
      usdcCompoundData, 
      usdcDecimals,
      usdcCollateralData,
      usdcCollateralPrices,
      usdcCollateralDecimals
    );
    computePosition(
      "USDT", 
      usdtAddress, 
      usdtCompoundData, 
      usdtDecimals,
      usdtCollateralData,
      usdtCollateralPrices,
      usdtCollateralDecimals
    );
    computePosition(
      "USDC.e", 
      usdcEAddress, 
      usdcECompoundData, 
      usdcEDecimals,
      usdcECollateralData,
      usdcECollateralPrices,
      usdcECollateralDecimals
    );

    return { suppliedPositions: supplied, borrowedPositions: borrowed };
  }, [
    wethAddress, wethCompoundData, wethDecimals, wethCollateralData, wethCollateralPrices, wethCollateralDecimals,
    usdcAddress, usdcCompoundData, usdcDecimals, usdcCollateralData, usdcCollateralPrices, usdcCollateralDecimals,
    usdtAddress, usdtCompoundData, usdtDecimals, usdtCollateralData, usdtCollateralPrices, usdtCollateralDecimals,
    usdcEAddress, usdcECompoundData, usdcEDecimals, usdcECollateralData, usdcECollateralPrices, usdcECollateralDecimals,
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
      />
    </div>
  );
};

export default CompoundProtocolView;

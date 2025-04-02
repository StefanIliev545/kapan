import { FC, useEffect, useMemo, useState } from "react";
import { ProtocolPosition, ProtocolView } from "../../ProtocolView";
import { CompoundCollateralView } from "./CompoundCollateralView";
import { formatUnits } from "viem";
import { useAccount, useWalletClient } from "wagmi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldContract, useScaffoldReadContract } from "~~/hooks/scaffold-eth";

// Define a constant for zero address
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const CompoundProtocolView: FC = () => {
  const { address: connectedAddress } = useAccount();
  const { data: walletClient } = useWalletClient();

  // State to track if we should force showing all assets when wallet is not connected
  const [forceShowAll, setForceShowAll] = useState(false);

  // Determine the address to use for queries
  const queryAddress = connectedAddress || ZERO_ADDRESS;

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
    }, 2500); // Wait 1.5 seconds before deciding wallet is not connected

    return () => clearTimeout(timeout);
  }, [connectedAddress]);

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
    args: [wethAddress, queryAddress],
  });
  const { data: usdcCompoundData } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getCompoundData",
    args: [usdcAddress, queryAddress],
  });
  const { data: usdtCompoundData } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getCompoundData",
    args: [usdtAddress, queryAddress],
  });
  const { data: usdcECompoundData } = useScaffoldReadContract({
    contractName: "CompoundGateway",
    functionName: "getCompoundData",
    args: [usdcEAddress, queryAddress],
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

  // Aggregate positions using useMemo.
  const { suppliedPositions, borrowedPositions } = useMemo(() => {
    const supplied: ProtocolPosition[] = [];
    const borrowed: ProtocolPosition[] = [];

    const computePosition = (
      tokenName: string,
      tokenAddress: string | undefined,
      compoundData: any,
      decimalsRaw: any,
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
        // Store collateral value as a custom property
        collateralValue: 0, // This is now calculated inside the CollateralView
        tokenBalance: borrowBalanceRaw || 0n,
        currentRate: borrowAPR,
        tokenAddress: tokenAddress,
        tokenPrice: price,
        tokenDecimals: decimals,
        tokenSymbol: tokenName,
        collateralView: (
          <CompoundCollateralView
            baseToken={tokenAddress}
            baseTokenDecimals={decimals}
            compoundData={compoundData}
          />
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

    computePosition(
      "WETH",
      wethAddress,
      wethCompoundData,
      wethDecimals,
    );
    computePosition(
      "USDC",
      usdcAddress,
      usdcCompoundData,
      usdcDecimals,
    );
    computePosition(
      "USDT",
      usdtAddress,
      usdtCompoundData,
      usdtDecimals,
    );
    computePosition(
      "USDC.e",
      usdcEAddress,
      usdcECompoundData,
      usdcEDecimals,
    );

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
      />
    </div>
  );
};

export default CompoundProtocolView;

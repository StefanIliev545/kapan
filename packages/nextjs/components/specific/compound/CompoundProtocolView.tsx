import { FC, useMemo } from "react";
import { ProtocolPosition, ProtocolView } from "../../ProtocolView";
import { formatUnits } from "viem";
import { useAccount, useWalletClient } from "wagmi";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { useScaffoldContract, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { CompoundCollateralView } from "./CompoundCollateralView";

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

    // Utility to compute a position for a token.
    // compoundData is expected to be a tuple: [supplyRate, borrowRate, balance, borrowBalance]
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
      const balance = balanceRaw ? Number(formatUnits(balanceRaw, decimals)) * Number(formatUnits(price, 8)) : 0;
      const borrowBalance = borrowBalanceRaw ? Number(formatUnits(borrowBalanceRaw, decimals)) : 0;

      console.log(`${tokenName} address: ${tokenAddress}`);

      borrowed.push({
        icon: tokenNameToLogo(tokenName),
        name: tokenName,
        balance: -borrowBalance,
        currentRate: borrowAPR,
        tokenAddress: tokenAddress,
        collateralView: <CompoundCollateralView baseToken={tokenAddress} />,
      });

      supplied.push({
        icon: tokenNameToLogo(tokenName),
        name: tokenName,
        balance: balance,
        currentRate: supplyAPR,
        tokenAddress: tokenAddress,
      });
    };

    computePosition("WETH", wethAddress, wethCompoundData, wethDecimals);
    computePosition("USDC", usdcAddress, usdcCompoundData, usdcDecimals);
    computePosition("USDT", usdtAddress, usdtCompoundData, usdtDecimals);
    computePosition("USDC.e", usdcEAddress, usdcECompoundData, usdcEDecimals);

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
    connectedAddress,
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
      />
    </div>
  );
};

export default CompoundProtocolView;

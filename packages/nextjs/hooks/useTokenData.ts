import { useEffect, useState } from "react";
import { useScaffoldReadContract } from "./scaffold-eth";
import { useInterval } from "usehooks-ts";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import externalContracts from "~~/contracts/externalContracts";
import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

interface TokenData {
  symbol: string;
  address: string;
  totalDebt: number;
  protocols: {
    name: string;
    rate: number;
  }[];
}

export const useTokenData = () => {
  const { targetNetwork } = useTargetNetwork();
  
  // Get tokens from external contracts for current network
  const TOKENS = Object.entries(externalContracts[targetNetwork.id as keyof typeof externalContracts] as GenericContractsDeclaration[number])
    .filter(([name]) => ["USDC", "USDT", "USDCe", "ETH"].includes(name))
    .map(([name, data]) => ({
      symbol: name == "USDCe" ? "USDC.e" : name,
      address: data.address,
      // Hardcoded total debt values from Aave
      totalDebt:
        name === "USDC" ? 169_620_000 : name === "USDT" ? 73_370_000 : name === "USDCe" ? 2_720_000 : 221_280_000, // ETH
    }));

  const [currentTokenIndex, setCurrentTokenIndex] = useState(0);
  const [tokenData, setTokenData] = useState<TokenData>({
    ...TOKENS[0],
    protocols: [],
  });

  // Get all protocol rates from OptimalInterestRateFinder
  const { data: protocolRates } = useScaffoldReadContract({
    contractName: "OptimalInterestRateFinder",
    functionName: "getAllProtocolBorrowRates",
    args: [tokenData.address],
  });

  // Update rates when they change
  useEffect(() => {
    if (protocolRates) {
      const [protocols, rates, success] = protocolRates;

      // Create array of protocol data with names and rates
      const protocolData = protocols.map((name, index) => ({
        name: name as string,
        rate: success[index] ? Number(rates[index]) / 1e8 : 0, // Convert from 8 decimals to percentage
      }));

      setTokenData((prev: TokenData) => ({
        ...prev,
        protocols: protocolData,
      }));
    }
  }, [protocolRates]);

  // Rotate through tokens every 10 seconds
  useInterval(() => {
    const nextIndex = (currentTokenIndex + 1) % TOKENS.length;
    setCurrentTokenIndex(nextIndex);
    setTokenData({
      ...TOKENS[nextIndex],
      protocols: [],
    });
  }, 6500);

  return tokenData;
};

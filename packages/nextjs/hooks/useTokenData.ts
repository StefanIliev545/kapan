import { useEffect, useState } from "react";
import { useInterval } from "usehooks-ts";
import externalContracts from "~~/contracts/externalContracts";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";
import { useLocalRateProvider } from "./useLocalRateProvider";
import { Address } from "viem";

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
  const TOKENS = Object.entries(
    externalContracts[targetNetwork.id as keyof typeof externalContracts] as GenericContractsDeclaration[number],
  )
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

  // Get all protocol rates from local rate provider (replaces OptimalInterestRateFinder)
  const { optimal, allRates, isLoading: ratesLoading } = useLocalRateProvider(tokenData.address as Address, "borrow");
  
  // Format for compatibility with existing code
  const protocolRates = allRates;

  // Update rates when they change
  useEffect(() => {
    if (protocolRates) {
      const [protocols, rates, success] = protocolRates;

      // Create array of protocol data with names and rates
      const protocolData = protocols.map((name, index) => {
        // Clean up protocol names for display
        let displayName = name as string;
        if (displayName.toLowerCase() === "aave") displayName = "Aave V3";
        if (displayName.toLowerCase() === "compound") displayName = "Compound V3";
        if (displayName.toLowerCase() === "venus") displayName = "Venus";
        
        return {
          name: displayName,
          rate: success[index] ? Number(rates[index]) / 1e8 : 0, // Convert from 8 decimals to percentage
        };
      }).filter(p => p.rate > 0); // Filter out protocols with zero rates
      
      // Sort by rate (highest first) to ensure comparison component works correctly
      protocolData.sort((a, b) => b.rate - a.rate);

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

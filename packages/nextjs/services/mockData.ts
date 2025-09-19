import { useQuery } from "@tanstack/react-query";

import { qk } from "~~/lib/queryKeys";
import { MockData, MockDataSchema } from "../types/mockData";

// Function to simulate fetching data from an API
const fetchMockData = async (): Promise<MockData> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Mock data
  const data = {
    aaveDebt: 4257813,
    aaveRate: 4.82,
    compoundRate: 3.15,
    potentialSavings: 71223,
    totalSavedToDate: 156432,
    activeBorrowersCount: 283,
    supportedChains: ['Arbitrum', 'Ethereum', 'Starknet'],
    supportedProtocols: ['Aave', 'Compound', 'Nostra'],
    timestamp: new Date()
  };
  
  // Parse with zod schema to ensure type safety
  return MockDataSchema.parse(data);
};

// React Query hook for fetching mock data
export const useMockData = () => {
  return useQuery({
    queryKey: qk.mockData(),
    queryFn: fetchMockData,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 30 * 1000,
  });
};
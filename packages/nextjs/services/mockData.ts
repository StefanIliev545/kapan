import { useQuery } from "@tanstack/react-query";
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
    supportedChains: ['Arbitrum', 'Ethereum'],
    supportedProtocols: ['Aave', 'Compound'],
    timestamp: new Date()
  };
  
  // Parse with zod schema to ensure type safety
  return MockDataSchema.parse(data);
};

// React Query hook for fetching mock data
export const useMockData = () => {
  return useQuery({
    queryKey: ["mockData"],
    queryFn: fetchMockData,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
  });
}; 
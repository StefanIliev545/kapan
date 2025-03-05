import { z } from "zod";

export const MockDataSchema = z.object({
  aaveDebt: z.number(),
  aaveRate: z.number(),
  compoundRate: z.number(),
  potentialSavings: z.number(),
  totalSavedToDate: z.number(),
  activeBorrowersCount: z.number(),
  supportedChains: z.array(z.string()),
  supportedProtocols: z.array(z.string()),
  timestamp: z.date(),
});

export type MockData = z.infer<typeof MockDataSchema>; 
import type { Meta, StoryObj } from "@storybook/react";
import { parseUnits } from "viem";
import { CompoundMarkets } from "./CompoundMarkets";

const createNetworkResult = <T,>(data: T) => ({
  data,
  error: undefined,
  isError: false,
  isLoading: false,
  status: "success" as const,
  isSuccess: true,
  refetch: async () => ({ data } as unknown),
});

const YEAR = 31_536_000;
const toPerSecondRate = (aprPercentage: number) =>
  BigInt(Math.round((aprPercentage / 100) * 1e18 / YEAR));

const addresses = {
  weth: "0x0000000000000000000000000000000000000201",
  usdc: "0x0000000000000000000000000000000000000202",
  usdt: "0x0000000000000000000000000000000000000203",
  usdce: "0x0000000000000000000000000000000000000204",
} as const;

const compoundSnapshots: Record<string, readonly [bigint, bigint, bigint, bigint, bigint, bigint]> = {
  [addresses.weth]: [
    toPerSecondRate(2.1),
    toPerSecondRate(4.8),
    parseUnits("2.4", 18),
    parseUnits("0.85", 18),
    BigInt(Math.round(3200 * 1e8)),
    10n ** 8n,
  ],
  [addresses.usdc]: [
    toPerSecondRate(4.6),
    toPerSecondRate(6.1),
    parseUnits("12500", 6),
    parseUnits("4500", 6),
    BigInt(Math.round(1 * 1e8)),
    10n ** 8n,
  ],
  [addresses.usdt]: [
    toPerSecondRate(3.8),
    toPerSecondRate(5.2),
    parseUnits("8200", 6),
    parseUnits("1200", 6),
    BigInt(Math.round(1 * 1e8)),
    10n ** 8n,
  ],
  [addresses.usdce]: [
    toPerSecondRate(5.1),
    toPerSecondRate(6.4),
    parseUnits("6400", 6),
    parseUnits("0", 6),
    BigInt(Math.round(1 * 1e8)),
    10n ** 8n,
  ],
};

const deployedContracts = {
  eth: { address: addresses.weth, abi: [] as any },
  USDC: { address: addresses.usdc, abi: [] as any },
  USDT: { address: addresses.usdt, abi: [] as any },
  USDCe: { address: addresses.usdce, abi: [] as any },
  CompoundGateway: { address: "0x0000000000000000000000000000000000000300", abi: [] as any },
} as const;

const meta: Meta<typeof CompoundMarkets> = {
  title: "Protocols/Compound/Markets",
  component: CompoundMarkets,
  args: {
    viewMode: "grid",
    search: "",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  parameters: {
    storybookMocks: {
      useDeployedContractInfo: ({
        config,
        originalResult,
      }: {
        config: { contractName: string };
        originalResult: { data: unknown; isLoading: boolean };
      }) => {
        const contract = deployedContracts[config.contractName as keyof typeof deployedContracts];
        if (!contract) return originalResult;
        return {
          data: contract,
          isLoading: false,
        };
      },
      useNetworkAwareReadContract: ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
        if (!args) return undefined;
        if (functionName === "getCompoundData") {
          const [token] = args as [string];
          return createNetworkResult(compoundSnapshots[token as keyof typeof compoundSnapshots]);
        }
        return undefined;
      },
    },
  },
};

export const Loading: Story = {
  parameters: {
    storybookMocks: {
      useDeployedContractInfo: () => ({ data: undefined, isLoading: true }),
      useNetworkAwareReadContract: () => ({
        data: undefined,
        error: undefined,
        isError: false,
        isLoading: true,
        status: "loading" as const,
        isSuccess: false,
        refetch: async () => ({ data: undefined } as unknown),
      }),
    },
  },
};

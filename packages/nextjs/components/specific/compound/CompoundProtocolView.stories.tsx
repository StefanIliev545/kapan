import type { Meta, StoryObj } from "@storybook/react";
import { parseUnits } from "viem";
import { CompoundProtocolView } from "./CompoundProtocolView";

const createReadResult = <T,>(data: T, overrides: Partial<{ isLoading: boolean }> = {}) => ({
  data,
  isLoading: overrides.isLoading ?? false,
  isFetching: false,
  error: undefined,
  refetch: async () => ({ data } as unknown),
});

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

const decimalsMap: Record<string, bigint> = {
  [addresses.weth]: 18n,
  [addresses.usdc]: 6n,
  [addresses.usdt]: 6n,
  [addresses.usdce]: 6n,
};

const basePrices: Record<string, bigint> = {
  [addresses.weth]: BigInt(Math.round(3200 * 1e8)),
  [addresses.usdc]: BigInt(Math.round(1 * 1e8)),
  [addresses.usdt]: BigInt(Math.round(1 * 1e8)),
  [addresses.usdce]: BigInt(Math.round(1 * 1e8)),
};

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

const collateralDataByBase = {
  [addresses.weth]: {
    addresses: [addresses.usdc, addresses.usdt],
    balances: [parseUnits("4200", 6), parseUnits("2500", 6)],
    names: ["USDC", "USDT"],
    prices: [BigInt(Math.round((1 / 3200) * 1e8)), BigInt(Math.round((1 / 3200) * 1e8))],
    decimals: [6n, 6n],
  },
  [addresses.usdc]: {
    addresses: [addresses.weth, addresses.usdt],
    balances: [parseUnits("1.2", 18), parseUnits("1500", 6)],
    names: ["ETH", "USDT"],
    prices: [BigInt(Math.round(3200 * 1e8)), BigInt(Math.round(1 * 1e8))],
    decimals: [18n, 6n],
  },
  [addresses.usdt]: {
    addresses: [addresses.weth, addresses.usdc],
    balances: [parseUnits("0.4", 18), parseUnits("900", 6)],
    names: ["ETH", "USDC"],
    prices: [BigInt(Math.round(3200 * 1e8)), BigInt(Math.round(1 * 1e8))],
    decimals: [18n, 6n],
  },
  [addresses.usdce]: {
    addresses: [addresses.usdc],
    balances: [parseUnits("500", 6)],
    names: ["USDC"],
    prices: [BigInt(Math.round(1 * 1e8))],
    decimals: [6n],
  },
} as const;

const deployedContracts = {
  eth: { address: addresses.weth, abi: [] as any },
  USDC: { address: addresses.usdc, abi: [] as any },
  USDT: { address: addresses.usdt, abi: [] as any },
  USDCe: { address: addresses.usdce, abi: [] as any },
  CompoundGateway: { address: "0x0000000000000000000000000000000000000300", abi: [] as any },
  RouterGateway: { address: "0x0000000000000000000000000000000000000400", abi: [] as any },
  UiHelper: { address: "0x0000000000000000000000000000000000000500", abi: [] as any },
} as const;

const meta: Meta<typeof CompoundProtocolView> = {
  title: "Protocols/Compound/ProtocolView",
  component: CompoundProtocolView,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
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
      useScaffoldReadContract: ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
        if (!args) return undefined;
        if (functionName === "getDepositedCollaterals") {
          const base = args[0] as string;
          const entry = collateralDataByBase[base as keyof typeof collateralDataByBase];
          if (!entry) return createReadResult([[], [], []]);
          return createReadResult([entry.addresses, entry.balances, entry.names]);
        }
        if (functionName === "getPrices") {
          const base = args[0] as string;
          const entry = collateralDataByBase[base as keyof typeof collateralDataByBase];
          if (!entry) return createReadResult([]);
          return createReadResult(entry.prices);
        }
        if (functionName === "getDecimals") {
          const requested = args[0] as string[];
          return createReadResult(requested.map(address => decimalsMap[address] ?? 18n));
        }
        if (functionName === "getPrice") {
          const [base] = args as [string];
          return createReadResult(basePrices[base] ?? BigInt(0));
        }
        return undefined;
      },
      useNetworkAwareReadContract: ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
        if (!args) return undefined;
        if (functionName === "getCompoundData") {
          const [token] = args as [string];
          const snapshot = compoundSnapshots[token as keyof typeof compoundSnapshots];
          return createNetworkResult(snapshot ?? undefined);
        }
        if (functionName === "decimals") {
          const token = args?.[0] as string | undefined;
          return createNetworkResult(decimalsMap[token ?? ""] ?? 18n);
        }
        return undefined;
      },
    },
  },
};

export const LoadingData: Story = {
  parameters: {
    storybookMocks: {
      useDeployedContractInfo: () => ({ data: undefined, isLoading: true }),
      useScaffoldReadContract: () => createReadResult(undefined, { isLoading: true }),
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

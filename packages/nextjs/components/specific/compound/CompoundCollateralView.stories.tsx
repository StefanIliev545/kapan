import type { Meta, StoryObj } from "@storybook/react";
import { parseUnits } from "viem";
import { CompoundCollateralView } from "./CompoundCollateralView";

const createReadResult = <T,>(data: T, overrides: Partial<{ isLoading: boolean }> = {}) => ({
  data,
  isLoading: overrides.isLoading ?? false,
  isFetching: false,
  error: undefined,
  refetch: async () => ({ data } as unknown),
});

const collateralAddresses = [
  "0x0000000000000000000000000000000000000101",
  "0x0000000000000000000000000000000000000102",
  "0x0000000000000000000000000000000000000103",
] as const;

const collateralBalances = [
  parseUnits("1.2", 18),
  parseUnits("0.05", 8),
  parseUnits("5000", 6),
] as const;

const collateralDisplayNames = ["ETH", "WBTC", "USDT"] as const;

const collateralPrices = [
  BigInt(Math.round(3100 * 1e8)),
  BigInt(Math.round(68000 * 1e8)),
  BigInt(Math.round(1 * 1e8)),
] as const;

const collateralDecimals = [18n, 8n, 6n] as const;

const baseTokenAddress = "0x00000000000000000000000000000000000000ab";

const compoundData = [
  BigInt(Math.round((0.8 / 100) * 1e18 / 31_536_000)),
  BigInt(Math.round((4.1 / 100) * 1e18 / 31_536_000)),
  parseUnits("2000", 6),
  parseUnits("450", 6),
  BigInt(Math.round(1 * 1e8)),
  10n ** 8n,
] as const;

const baseTokenUsdPrice = BigInt(Math.round(1 * 1e8));

const meta: Meta<typeof CompoundCollateralView> = {
  title: "Protocols/Compound/CollateralView",
  component: CompoundCollateralView,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  args: {
    baseToken: baseTokenAddress,
    baseTokenDecimals: 6,
    compoundData,
    isVisible: true,
  },
  parameters: {
    storybookMocks: {
      useScaffoldReadContract: ({ functionName }: { functionName: string }) => {
        if (functionName === "getDepositedCollaterals") {
          return createReadResult([
            [...collateralAddresses],
            [...collateralBalances],
            [...collateralDisplayNames],
          ]);
        }
        if (functionName === "getPrices") {
          return createReadResult([...collateralPrices]);
        }
        if (functionName === "getDecimals") {
          return createReadResult([...collateralDecimals]);
        }
        if (functionName === "getPrice") {
          return createReadResult(baseTokenUsdPrice);
        }
        return undefined;
      },
    },
  },
};

export const NoCollateral: Story = {
  args: {
    baseToken: baseTokenAddress,
    baseTokenDecimals: 6,
    compoundData,
    isVisible: true,
    initialShowAll: true,
  },
  parameters: {
    storybookMocks: {
      useScaffoldReadContract: ({ functionName }: { functionName: string }) => {
        if (functionName === "getPrice") {
          return createReadResult(baseTokenUsdPrice);
        }
        return createReadResult([]);
      },
    },
  },
};

export const Loading: Story = {
  args: {
    baseToken: baseTokenAddress,
    baseTokenDecimals: 6,
    compoundData,
    isVisible: true,
  },
  parameters: {
    storybookMocks: {
      useScaffoldReadContract: ({ functionName }: { functionName: string }) => {
        return createReadResult(undefined, { isLoading: true });
      },
    },
  },
};

import type { Meta, StoryObj } from "@storybook/react";
import { VesuProtocolView } from "./VesuProtocolView";
import { POOL_IDS } from "./VesuMarkets";

const meta: Meta<typeof VesuProtocolView> = {
  title: "Protocols/VesuProtocolView",
  component: VesuProtocolView,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const SCALE = 10n ** 18n;
const YEAR = 31_536_000;

const toFelt = (value: string): bigint => {
  const hex = Array.from(value).map(char => char.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  return BigInt(`0x${hex}`);
};

const aprToInterestPerSecond = (apr: number): bigint => {
  return BigInt(Math.round((apr * 1e18) / YEAR));
};

const createAsset = ({
  address,
  symbol,
  decimals,
  priceUsd,
  apr,
  utilization,
}: {
  address: bigint;
  symbol: string;
  decimals: number;
  priceUsd: number;
  apr: number;
  utilization: number;
}) => {
  const interestPerSecond = aprToInterestPerSecond(apr);
  return {
    address,
    symbol: toFelt(symbol),
    decimals,
    rate_accumulator: SCALE,
    utilization: BigInt(Math.round(utilization * 1e16)),
    fee_rate: interestPerSecond,
    price: { value: BigInt(Math.round(priceUsd * 1e10)), is_valid: true },
    total_nominal_debt: 2_500n,
    last_rate_accumulator: SCALE,
    reserve: 3_000n,
    scale: 10_000n,
  };
};

const strk = 0x1n;
const usdc = 0x2n;
const eth = 0x3n;

const supportedAssets = [
  createAsset({ address: strk, symbol: "STRK", decimals: 18, priceUsd: 1.35, apr: 0.038, utilization: 0.62 }),
  createAsset({ address: usdc, symbol: "USDC", decimals: 6, priceUsd: 1, apr: 0.052, utilization: 0.48 }),
  createAsset({ address: eth, symbol: "ETH", decimals: 18, priceUsd: 3200, apr: 0.046, utilization: 0.54 }),
];

const formatPosition = (
  collateral: bigint,
  debt: bigint,
  collateralAmount: bigint,
  nominalDebt: bigint,
  isVtoken = false,
) => [
  collateral,
  debt,
  {
    collateral_shares: collateralAmount,
    collateral_amount: collateralAmount,
    nominal_debt: nominalDebt,
    is_vtoken: isVtoken,
  },
];

const positionsBatch = [
  formatPosition(strk, usdc, 4n * 10n ** 18n, 1_200n * 10n ** 6n),
  formatPosition(eth, strk, 1n * 10n ** 18n, 0n),
];

const createReadResult = <T,>(data: T) => ({
  data,
  isLoading: false,
  isFetching: false,
  error: undefined,
  refetch: async () => ({ data } as unknown),
});

const poolId = POOL_IDS.Genesis;

export const Disconnected: Story = {
  parameters: {
    storybookMocks: {
      useAccount: () => ({
        account: undefined,
        address: undefined,
        chainId: 0n,
        status: "disconnected",
        isConnected: false,
      }),
      useScaffoldReadContract: () => createReadResult(undefined),
    },
  },
};

export const WithPositions: Story = {
  parameters: {
    storybookMocks: {
      useAccount: () => ({
        account: undefined,
        address: "0x0123456789abcdef",
        chainId: 0n,
        status: "connected",
        isConnected: true,
      }),
      useScaffoldReadContract: ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
        if (functionName === "get_supported_assets_ui") {
          return createReadResult(supportedAssets);
        }
        if (functionName === "get_all_positions_range") {
          const start = args?.[2] as bigint;
          const requestedPool = args?.[1] as bigint;
          if (requestedPool !== poolId) {
            return createReadResult([]);
          }
          return createReadResult(start === 0n ? positionsBatch : []);
        }
        return undefined;
      },
    },
  },
};

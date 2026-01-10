/**
 * Shared types for market components (MarketRow, MarketCard)
 */

export type NetworkType = "evm" | "starknet";
export type SupportedNetwork = "arbitrum" | "base" | "optimism" | "linea" | "starknet";

export type MarketProps = {
  icon: string;
  name: string;
  supplyRate: string;
  borrowRate: string;
  price: string;
  utilization: string;
  address: string;
  networkType: NetworkType;
  protocol: string;
  network: SupportedNetwork;
  poolName?: string;
  allowDeposit?: boolean;
};

/**
 * Token data for deposit modal
 */
export type MarketTokenData = {
  name: string;
  icon: string;
  address: string;
  currentRate: number;
};

/**
 * Extract token data from market props for deposit modal
 */
export function getMarketTokenData(props: Pick<MarketProps, "name" | "icon" | "address" | "supplyRate">): MarketTokenData {
  return {
    name: props.name,
    icon: props.icon,
    address: props.address,
    currentRate: parseFloat(props.supplyRate.replace("%", "")),
  };
}

/**
 * Check if deposit is allowed for this market
 */
export function canDeposit(props: Pick<MarketProps, "allowDeposit" | "networkType">): boolean {
  return Boolean(props.allowDeposit && props.networkType === "starknet");
}

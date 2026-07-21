import type React from "react";
import type { SwapAsset } from "~~/components/modals/SwapModalShell";
import type { CollateralWithAmount } from "~~/components/specific/collateral/CollateralSelector";
import type { VesuContext } from "~~/utils/vesu";

/** Normalized position data consumed by the shared protocol dashboard UI. */
export interface ProtocolPosition {
  icon: string;
  name: string;
  balance: number;
  tokenBalance: bigint;
  currentRate: number;
  tokenAddress: string;
  tokenPrice?: bigint;
  usdPrice?: number;
  tokenDecimals?: number;
  tokenSymbol?: string;
  collaterals?: SwapAsset[];
  collateralView?: React.ReactNode;
  collateralValue?: number;
  vesuContext?: {
    deposit?: VesuContext;
    withdraw?: VesuContext;
    borrow?: VesuContext;
    repay?: VesuContext;
  };
  protocolContext?: string;
  moveSupport?: {
    preselectedCollaterals?: CollateralWithAmount[];
    disableCollateralSelection?: boolean;
  };
  actionsDisabled?: boolean;
  actionsDisabledReason?: string;
}

/** Public configuration for the shared EVM and Starknet protocol view. */
export interface ProtocolViewProps {
  protocolName: string;
  protocolIcon: string;
  suppliedPositions: ProtocolPosition[];
  borrowedPositions: ProtocolPosition[];
  hideUtilization?: boolean;
  forceShowAll?: boolean;
  networkType: "evm" | "starknet";
  disableMoveSupply?: boolean;
  readOnly?: boolean;
  expandFirstPositions?: boolean;
  chainId?: number;
  enabledFeatures?: {
    swap?: boolean;
    move?: boolean;
  };
  ltvBps?: bigint;
  lltvBps?: bigint;
  disableMarkets?: boolean;
  inlineMarkets?: boolean;
  disableLoop?: boolean;
  autoExpandOnPositions?: boolean;
  hasLoadedOnce?: boolean;
  headerElement?: React.ReactNode;
  adlCollateralToken?: string;
  adlDebtToken?: string;
}

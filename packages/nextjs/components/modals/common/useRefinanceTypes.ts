/**
 * Shared types for Refinance modals (EVM and Starknet)
 */

/* ------------------------------ Position Types ------------------------------ */

/**
 * Base position type shared between EVM and Starknet refinance modals
 */
export type RefinancePosition = {
  name: string;
  tokenAddress: string;
  decimals: number;
  balance?: number | bigint;
  poolId?: bigint | string;
  type: "borrow" | "supply";
};

/**
 * Pre-selected collateral passed to refinance modals
 */
export type PreSelectedCollateral = {
  token: string;
  symbol: string;
  decimals: number;
  amount?: bigint;
  maxAmount?: bigint;
  inputValue?: string;
};

/* ------------------------------ Protocol Types ------------------------------ */

export type Protocol = {
  name: string;
  logo: string;
};

export type FlashLoanProvider = {
  name: string;
  icon: string;
  version: string;
};

/* ------------------------------ Vesu Pool Types ------------------------------ */

export type VesuV1Pool = {
  name: string;
  id?: bigint;
};

export type VesuV2Pool = {
  name: string;
  address?: string;
};

export type VesuPools = {
  v1Pools: VesuV1Pool[];
  v2Pools: VesuV2Pool[];
};

/* ------------------------------ Collateral Types ------------------------------ */

export type Collateral = {
  address: string;
  symbol: string;
  icon: string;
  decimals: number;
  rawBalance: bigint;
  balance: number;
};

/* ------------------------------ Props Interfaces ------------------------------ */

/**
 * Base props shared between EVM and Starknet refinance modal implementations
 */
export type RefinanceModalBaseProps = {
  isOpen: boolean;
  onClose: () => void;
  fromProtocol: string;
  position: RefinancePosition;
  preSelectedCollaterals?: PreSelectedCollateral[];
  disableCollateralSelection?: boolean;
};

/**
 * EVM-specific props extending base props
 */
export type RefinanceModalEvmProps = RefinanceModalBaseProps & {
  chainId?: number;
  /** Pre-encoded context for the source protocol (e.g., Morpho MarketParams) */
  fromContext?: string;
};

/**
 * Starknet-specific props (currently same as base)
 */
export type RefinanceModalStarkProps = RefinanceModalBaseProps;

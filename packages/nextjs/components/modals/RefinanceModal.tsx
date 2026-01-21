import React, { FC } from "react";
import { type NetworkType } from "~~/hooks/useMovePositionData";
import { RefinanceModalEvm } from "./RefinanceModalEvm";
import { RefinanceModalStark } from "./RefinanceModalStark";
  
  /* ---------------------------- Component ------------------------------ */
  
  type RefinanceModalProps = {
    isOpen: boolean;
    onClose: () => void;
    fromProtocol: string;
    position: {
      name: string; // debt token symbol
      tokenAddress: string;
      decimals: number;
      balance?: number | bigint;
      poolId?: bigint | string;
      type: "borrow" | "supply";
    };
    chainId?: number;
    networkType: NetworkType;
    preSelectedCollaterals?: Array<{
      token: string;
      symbol: string;
      decimals: number;
      amount?: bigint;
      maxAmount?: bigint;
      inputValue?: string;
      /** Euler-specific: The collateral vault address for this collateral */
      eulerCollateralVault?: string;
      /** Euler-specific: The sub-account index for this position */
      eulerSubAccountIndex?: number;
    }>;
    disableCollateralSelection?: boolean;
    /** Pre-encoded context for the source protocol (e.g., Morpho MarketParams) */
    fromContext?: string;
  };
  
  export const RefinanceModal: FC<RefinanceModalProps> = ({
    isOpen,
    onClose,
    fromProtocol,
    position,
    chainId,
    networkType,
    preSelectedCollaterals,
    disableCollateralSelection,
    fromContext,
  }) => {
  if (networkType === "evm") {
    return (
      <RefinanceModalEvm
        isOpen={isOpen}
        onClose={onClose}
        fromProtocol={fromProtocol}
        position={position}
        chainId={chainId}
        preSelectedCollaterals={preSelectedCollaterals}
        disableCollateralSelection={disableCollateralSelection}
        fromContext={fromContext}
          />
        );
      }
  
  return (
    <RefinanceModalStark
      isOpen={isOpen}
      onClose={onClose}
      fromProtocol={fromProtocol}
      position={position}
      preSelectedCollaterals={preSelectedCollaterals}
      disableCollateralSelection={disableCollateralSelection}
    />
    );
  };
  
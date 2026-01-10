"use client";

import { FC } from "react";
import { SwitchModalBase, BasicToken } from "./SwitchModalBase";
import type { VesuProtocolKey } from "~~/utils/vesu";

interface SwitchCollateralModalProps {
  isOpen: boolean;
  onClose: () => void;
  poolKey: string;
  protocolKey: VesuProtocolKey;
  currentCollateral: BasicToken; // withdraw this
  targetCollateral: BasicToken; // deposit this
  debtToken: BasicToken; // debt context remains the same
  collateralBalance: bigint;
  debtBalance: bigint;
}

export const SwitchCollateralModalStark: FC<SwitchCollateralModalProps> = ({
  isOpen,
  onClose,
  poolKey,
  protocolKey,
  currentCollateral,
  targetCollateral,
  debtToken,
  collateralBalance,
  debtBalance,
}) => {
  return (
    <SwitchModalBase
      isOpen={isOpen}
      onClose={onClose}
      poolKey={poolKey}
      protocolKey={protocolKey}
      currentCollateral={currentCollateral}
      currentDebt={debtToken}
      targetToken={targetCollateral}
      collateralBalance={collateralBalance}
      debtBalance={debtBalance}
      type="collateral"
    />
  );
};

export default SwitchCollateralModalStark;

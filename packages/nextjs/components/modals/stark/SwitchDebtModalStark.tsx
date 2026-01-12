"use client";

import { FC } from "react";
import { SwitchModalBase, BasicToken } from "./SwitchModalBase";
import type { VesuProtocolKey } from "~~/utils/vesu";

interface SwitchDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  poolKey: string;
  protocolKey: VesuProtocolKey;
  collateral: BasicToken; // unchanged collateral
  currentDebt: BasicToken; // old debt to repay
  targetDebt: BasicToken; // new debt to borrow
  debtBalance: bigint; // amount to repay
  collateralBalance: bigint; // to withdraw/redeposit fully
}

export const SwitchDebtModalStark: FC<SwitchDebtModalProps> = ({
  isOpen,
  onClose,
  poolKey,
  protocolKey,
  collateral,
  currentDebt,
  targetDebt,
  debtBalance,
  collateralBalance,
}) => {
  return (
    <SwitchModalBase
      isOpen={isOpen}
      onClose={onClose}
      poolKey={poolKey}
      protocolKey={protocolKey}
      currentCollateral={collateral}
      currentDebt={currentDebt}
      targetToken={targetDebt}
      collateralBalance={collateralBalance}
      debtBalance={debtBalance}
      type="debt"
    />
  );
};

export default SwitchDebtModalStark;

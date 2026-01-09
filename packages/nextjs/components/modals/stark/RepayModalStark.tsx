import { FC } from "react";
import { REPAY_MODAL_CONFIG, ensureTokenDecimals, useRepayModal } from "../common/useRepayModal";
import { TokenActionModal, TokenInfo } from "../TokenActionModal";
import { useLendingAction } from "~~/hooks/useLendingAction";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { PositionManager } from "~~/utils/position";
import type { VesuContext } from "~~/utils/vesu";

interface RepayModalStarkProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  debtBalance: bigint;
  vesuContext?: VesuContext;
  position?: PositionManager;
}

export const RepayModalStark: FC<RepayModalStarkProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  debtBalance,
  vesuContext,
  position,
}) => {
  const { balance, decimals } = useTokenBalance(token.address, "stark", undefined, token.decimals);

  // Use shared hook for common repay calculations
  const { before, maxInput, effectiveDecimals } = useRepayModal({
    token,
    debtBalance,
    walletBalance: balance,
    decimals,
  });

  const { execute, buildCalls } = useLendingAction(
    "stark",
    "Repay",
    token.address,
    protocolName,
    effectiveDecimals,
    vesuContext,
    debtBalance,
    balance,
  );

  // Ensure token has decimals set (backwards compatibility)
  ensureTokenDecimals(token, effectiveDecimals);

  return (
    <TokenActionModal
      isOpen={isOpen}
      onClose={onClose}
      action={REPAY_MODAL_CONFIG.action}
      token={token}
      protocolName={protocolName}
      apyLabel={REPAY_MODAL_CONFIG.apyLabel}
      apy={token.currentRate}
      metricLabel={REPAY_MODAL_CONFIG.metricLabel}
      before={before}
      balance={balance}
      percentBase={debtBalance}
      max={maxInput}
      network="stark"
      buildCalls={buildCalls}
      position={position}
      onConfirm={execute}
    />
  );
};

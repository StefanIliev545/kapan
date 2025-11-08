/**
 * @deprecated This component is being phased out in favor of the unified modal system.
 * For new code, use `useOpenTransactionModal().openWithdrawModal()` instead.
 * This component is still used in some legacy components (SupplyPosition)
 * but should be migrated to use the unified modal context.
 * 
 * TODO: Migrate SupplyPosition to use UnifiedTransactionModal
 */
import { FC, useCallback, useEffect } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { formatUnits } from "viem";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEVMTransactionModal } from "~~/hooks/useEVMTransactionModal";
import { PositionManager } from "~~/utils/position";
import type { Address } from "viem";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  supplyBalance: bigint;
  position?: PositionManager;
  chainId?: number;
  market?: Address; // Market address for Compound (baseToken/comet address)
}

export const WithdrawModal: FC<WithdrawModalProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  supplyBalance,
  position,
  chainId,
  market,
}) => {
  const { buildWithdrawFlow } = useKapanRouterV2();
  const { decimals, preferBatching, setPreferBatching, isPreferenceLoaded, isAnyConfirmed, executeTransaction } = useEVMTransactionModal({
    isOpen,
    chainId,
    tokenAddress: token.address,
    protocolName,
    market,
  });

  if (token.decimals == null) {
    token.decimals = decimals;
  }

  const before = decimals ? Number(formatUnits(supplyBalance, decimals)) : 0;
  const maxInput = (supplyBalance * 101n) / 100n;

  useEffect(() => {
    if (isAnyConfirmed && isOpen) {
      onClose();
    }
  }, [isAnyConfirmed, isOpen, onClose]);

  const handleWithdraw = useCallback(
    async (amount: string, isMax?: boolean) => {
      await executeTransaction(
        () =>
          buildWithdrawFlow(
            protocolName.toLowerCase(),
            token.address,
            amount,
            token.decimals || decimals || 18,
            isMax || false,
            market
          ),
        "Withdraw transaction sent"
      );
    },
    [protocolName, token.address, token.decimals, decimals, market, buildWithdrawFlow, executeTransaction]
  );

  return (
    <TokenActionModal
      isOpen={isOpen}
      onClose={onClose}
      action="Withdraw"
      token={token}
      protocolName={protocolName}
      apyLabel="Supply APY"
      apy={token.currentRate}
      metricLabel="Total supplied"
      before={before}
      balance={supplyBalance}
      percentBase={supplyBalance}
      max={maxInput}
      network="evm"
      position={position}
      onConfirm={handleWithdraw}
      renderExtraContent={() => isPreferenceLoaded ? (
        <div className="pt-2 pb-1">
          <label className="label cursor-pointer gap-2 justify-start">
            <input
              type="checkbox"
              checked={preferBatching}
              onChange={(e) => setPreferBatching(e.target.checked)}
              className="checkbox checkbox-sm"
            />
            <span className="label-text text-xs">Batch Transactions with Smart Account</span>
          </label>
        </div>
      ) : null}
    />
  );
};

/**
 * @deprecated This component is being phased out in favor of the unified modal system.
 * For new code, use `useOpenTransactionModal().openDepositModal()` instead.
 * This component is still used in some legacy components (SupplyPosition, TokenSelectModal)
 * but should be migrated to use the unified modal context.
 * 
 * TODO: Migrate SupplyPosition and TokenSelectModal to use UnifiedTransactionModal
 */
import { FC, useCallback, useEffect } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEVMTransactionModal } from "~~/hooks/useEVMTransactionModal";
import { PositionManager } from "~~/utils/position";
import type { Address } from "viem";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  position?: PositionManager;
  chainId?: number;
  market?: Address; // Market address for Compound (baseToken/comet address)
}

export const DepositModal: FC<DepositModalProps> = ({ isOpen, onClose, token, protocolName, position, chainId, market }) => {
  const { buildDepositFlow } = useKapanRouterV2();
  const { balance, decimals, preferBatching, setPreferBatching, isPreferenceLoaded, isAnyConfirmed, executeTransaction } = useEVMTransactionModal({
    isOpen,
    chainId,
    tokenAddress: token.address,
    protocolName,
    market,
  });

  if (token.decimals == null) {
    token.decimals = decimals;
  }

  useEffect(() => {
    if (isAnyConfirmed) {
      onClose();
    }
  }, [isAnyConfirmed, onClose]);

  const handleDeposit = useCallback(
    async (amount: string) => {
      await executeTransaction(
        () => buildDepositFlow(protocolName.toLowerCase(), token.address, amount, token.decimals || decimals || 18, market),
        "Deposit transaction sent"
      );
    },
    [protocolName, token.address, token.decimals, decimals, market, buildDepositFlow, executeTransaction]
  );

  return (
    <TokenActionModal
      isOpen={isOpen}
      onClose={onClose}
      action="Deposit"
      token={token}
      protocolName={protocolName}
      apyLabel="Supply APY"
      apy={token.currentRate}
      metricLabel="Total supplied"
      before={0}
      balance={balance}
      network="evm"
      position={position}
      onConfirm={handleDeposit}
      renderExtraContent={() =>
        isPreferenceLoaded ? (
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
        ) : null
      }
    />
  );
};

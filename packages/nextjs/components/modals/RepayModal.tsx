import { FC, useCallback } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { formatUnits } from "viem";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { PositionManager } from "~~/utils/position";

interface RepayModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: TokenInfo;
  protocolName: string;
  debtBalance: bigint;
  position?: PositionManager;
  chainId?: number;
  /** Pre-encoded protocol context (e.g., Morpho MarketParams, Compound market address) */
  context?: string;
}

export const RepayModal: FC<RepayModalProps> = ({
  isOpen,
  onClose,
  token,
  protocolName,
  debtBalance,
  position,
  chainId,
  context,
}) => {
  const { balance: walletBalance, decimals } = useTokenBalance(token.address, "evm", chainId, token.decimals);
  const { buildRepayFlowAsync } = useKapanRouterV2();
  const normalizedProtocolName = protocolName.toLowerCase();

  if (token.decimals == null) {
    token.decimals = decimals;
  }

  const before = decimals ? Number(formatUnits(debtBalance, decimals)) : 0;
  const bump = (debtBalance * 101n) / 100n;
  const maxInput = walletBalance < bump ? walletBalance : bump;

  const buildFlow = useCallback(
    (amount: string, isMax?: boolean) =>
      buildRepayFlowAsync(
        normalizedProtocolName,
        token.address,
        amount,
        token.decimals || decimals || 18,
        isMax,
        maxInput,
        context,
      ),
    [
      buildRepayFlowAsync,
      context,
      decimals,
      maxInput,
      normalizedProtocolName,
      token.address,
      token.decimals,
    ],
  );

  const { handleConfirm: handleRepay, batchingPreference } = useEvmTransactionFlow({
    isOpen,
    chainId,
    onClose,
    buildFlow,
    successMessage: "Repay transaction sent",
    emptyFlowErrorMessage: "Failed to build repay instructions or no balance to repay",
    chainSwitchErrorMessage: "Please switch to the selected network to proceed",
  });

  const { enabled: preferBatching, setEnabled: setPreferBatching, isLoaded: isPreferenceLoaded } = batchingPreference;

  return (
    <TokenActionModal
      isOpen={isOpen}
      onClose={onClose}
      action="Repay"
      token={token}
      protocolName={protocolName}
      apyLabel="Borrow APY"
      apy={token.currentRate}
      metricLabel="Total debt"
      before={before}
      balance={walletBalance}
      percentBase={debtBalance}
      max={maxInput}
      network="evm"
      chainId={chainId}
      position={position}
      onConfirm={handleRepay}
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

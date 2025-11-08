import { FC, useCallback } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { formatUnits } from "viem";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
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
  const decimals = token.decimals;
  const normalizedProtocolName = protocolName.toLowerCase();

  const buildFlow = useCallback(
    (amount: string, isMax?: boolean) =>
      buildWithdrawFlow(
        normalizedProtocolName,
        token.address,
        amount,
        token.decimals || decimals || 18,
        isMax || false,
        market,
      ),
    [
      buildWithdrawFlow,
      decimals,
      market,
      normalizedProtocolName,
      token.address,
      token.decimals,
    ],
  );

  const { handleConfirm, batchingPreference } = useEvmTransactionFlow({
    isOpen,
    chainId,
    onClose,
    buildFlow,
    successMessage: "Withdraw transaction sent",
    emptyFlowErrorMessage: "Failed to build withdraw instructions",
  });
  const { enabled: preferBatching, setEnabled: setPreferBatching, isLoaded: isPreferenceLoaded } = batchingPreference;

  if (token.decimals == null) {
    token.decimals = decimals;
  }
  
  const before = decimals ? Number(formatUnits(supplyBalance, decimals)) : 0;
  const maxInput = (supplyBalance * 101n) / 100n;

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
      onConfirm={handleConfirm}
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

import { FC, useCallback } from "react";
import { TokenActionModal, TokenInfo } from "./TokenActionModal";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useTokenBalance } from "~~/hooks/useTokenBalance";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
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
  const { balance, decimals } = useTokenBalance(token.address, "evm", chainId, token.decimals);
  const normalizedProtocolName = protocolName.toLowerCase();

  if (token.decimals == null) {
    token.decimals = decimals;
  }

  const buildFlow = useCallback(
    (amount: string) =>
      buildDepositFlow(normalizedProtocolName, token.address, amount, token.decimals || decimals || 18, market),
    [
      buildDepositFlow,
      decimals,
      market,
      normalizedProtocolName,
      token.address,
      token.decimals,
    ],
  );

  const { handleConfirm: handleDeposit, batchingPreference } = useEvmTransactionFlow({
    isOpen,
    chainId,
    onClose,
    buildFlow,
    successMessage: "Deposit transaction sent",
    emptyFlowErrorMessage: "Failed to build deposit instructions",
  });

  const { enabled: preferBatching, setEnabled: setPreferBatching, isLoaded: isPreferenceLoaded } = batchingPreference;

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
      chainId={chainId}
      position={position}
      onConfirm={handleDeposit}
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

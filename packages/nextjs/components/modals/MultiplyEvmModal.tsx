import { FC, useMemo, useState } from "react";
import { Address, formatUnits, parseUnits } from "viem";
import { FiAlertTriangle, FiArrowDownCircle, FiPlus, FiZap } from "react-icons/fi";

import { BaseModal } from "./BaseModal";
import { useKapanRouterV2 } from "~~/hooks/useKapanRouterV2";
import { useEvmTransactionFlow } from "~~/hooks/useEvmTransactionFlow";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { useFlashLoanSelection } from "~~/hooks/useFlashLoanSelection";
import { useMovePositionData } from "~~/hooks/useMovePositionData";
import { use1inchQuote } from "~~/hooks/use1inchQuote";
import { SwapAsset } from "./SwapModalShell";
import { FlashLoanProvider } from "~~/utils/v2/instructionHelpers";

interface MultiplyEvmModalProps {
  isOpen: boolean;
  onClose: () => void;
  protocolName: string;
  chainId: number;
  collaterals: SwapAsset[];
  debtOptions: SwapAsset[];
  market?: Address;
}

export const MultiplyEvmModal: FC<MultiplyEvmModalProps> = ({
  isOpen,
  onClose,
  protocolName,
  chainId,
  collaterals,
  debtOptions,
  market,
}) => {
  const defaultCollateral = collaterals[0];
  const defaultDebt = debtOptions[0];

  const [collateral, setCollateral] = useState<SwapAsset | undefined>(defaultCollateral);
  const [debt, setDebt] = useState<SwapAsset | undefined>(defaultDebt);
  const [initialCollateral, setInitialCollateral] = useState<string>("");
  const [flashAmount, setFlashAmount] = useState<string>("");
  const [slippage, setSlippage] = useState<number>(1);

  const { data: oneInchAdapter } = useDeployedContractInfo({
    contractName: "OneInchAdapter",
    chainId: chainId as 31337 | 42161 | 10 | 8453 | 59144,
  });

  const flashLoanToken = debt?.address as Address | undefined;
  const flashLoanAmountRaw = useMemo(() => {
    try {
      return debt ? parseUnits(flashAmount || "0", debt.decimals) : 0n;
    } catch {
      return 0n;
    }
  }, [debt, flashAmount]);

  const { flashLoanProviders, defaultFlashLoanProvider } = useMovePositionData({
    isOpen,
    networkType: "evm",
    fromProtocol: protocolName,
    chainId,
    position: collateral
      ? { name: collateral.symbol, tokenAddress: collateral.address, decimals: collateral.decimals, type: "supply" }
      : { name: "", tokenAddress: "0x0000000000000000000000000000000000000000", decimals: 18, type: "supply" },
  });

  const providerOptions = useMemo(() => {
    if (flashLoanProviders && flashLoanProviders.length > 0) return flashLoanProviders;
    if (defaultFlashLoanProvider) return [defaultFlashLoanProvider];
    return [
      {
        name: "Balancer V2",
        icon: "/logos/balancer.svg",
        version: "v2",
        providerEnum: FlashLoanProvider.BalancerV2,
      },
    ];
  }, [defaultFlashLoanProvider, flashLoanProviders]);

  const { selectedProvider, setSelectedProvider, liquidityData } = useFlashLoanSelection({
    flashLoanProviders: providerOptions,
    defaultProvider: defaultFlashLoanProvider ?? providerOptions[0],
    tokenAddress: flashLoanToken,
    amount: flashLoanAmountRaw,
    chainId,
  });

  const selectedProviderEnum = selectedProvider?.providerEnum ?? providerOptions[0]?.providerEnum;
  const selectedLiquidity = useMemo(
    () => liquidityData.find(data => data.provider === selectedProviderEnum),
    [liquidityData, selectedProviderEnum],
  );

  const { data: swapQuote, isLoading: isSwapQuoteLoading } = use1inchQuote({
    chainId,
    src: (debt?.address as Address) || "0x0000000000000000000000000000000000000000",
    dst: (collateral?.address as Address) || "0x0000000000000000000000000000000000000000",
    amount: flashLoanAmountRaw.toString(),
    from: (oneInchAdapter?.address as Address) || "0x0000000000000000000000000000000000000000",
    slippage,
    enabled: isOpen && !!collateral && !!debt && flashLoanAmountRaw > 0n && !!oneInchAdapter,
  });

  const minCollateralOut = useMemo(() => {
    if (!swapQuote || !collateral) return { raw: 0n, formatted: "0" };
    const quoted = BigInt(swapQuote.dstAmount || "0");
    if (quoted === 0n) return { raw: 0n, formatted: "0" };
    const bufferBps = BigInt(Math.round(slippage * 100));
    const buffered = (quoted * (10000n - bufferBps)) / 10000n;
    return {
      raw: buffered,
      formatted: formatUnits(buffered, collateral.decimals),
    };
  }, [collateral, slippage, swapQuote]);

  const { buildMultiplyFlow } = useKapanRouterV2();

  const buildFlow = () => {
    if (!collateral || !debt || !swapQuote?.tx?.data) return [];
    return buildMultiplyFlow({
      protocolName,
      collateralToken: collateral.address as Address,
      debtToken: debt.address as Address,
      initialCollateral: initialCollateral || "0",
      flashLoanAmount: flashAmount || "0",
      minCollateralOut: minCollateralOut.formatted,
      swapData: swapQuote.tx.data,
      collateralDecimals: collateral.decimals,
      debtDecimals: debt.decimals,
      flashLoanProvider:
        selectedProvider?.providerEnum ?? defaultFlashLoanProvider?.providerEnum ?? FlashLoanProvider.BalancerV2,
      market,
    });
  };

  const { handleConfirm, batchingPreference } = useEvmTransactionFlow({
    isOpen,
    chainId,
    onClose,
    buildFlow,
    successMessage: "Multiply transaction sent",
    emptyFlowErrorMessage: "Unable to build multiply instructions",
  });

  const { enabled: preferBatching, setEnabled: setPreferBatching, isLoaded: isPreferenceLoaded } = batchingPreference;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="Multiply with Flash Loan">
      <div className="space-y-4">
        <div className="bg-base-200/50 rounded-lg p-3 space-y-2">
          <label className="text-xs font-semibold text-base-content/70">Collateral</label>
          <select
            className="select select-sm w-full"
            value={collateral?.address || ""}
            onChange={e => setCollateral(collaterals.find(c => c.address === e.target.value))}
          >
            {collaterals.map(asset => (
              <option key={asset.address} value={asset.address}>
                {asset.symbol}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="input input-bordered input-sm w-full"
            placeholder="Initial collateral amount"
            value={initialCollateral}
            onChange={e => setInitialCollateral(e.target.value)}
          />
        </div>

        <div className="bg-base-200/50 rounded-lg p-3 space-y-2">
          <label className="text-xs font-semibold text-base-content/70">Debt to Flash Borrow</label>
          <select
            className="select select-sm w-full"
            value={debt?.address || ""}
            onChange={e => setDebt(debtOptions.find(d => d.address === e.target.value))}
          >
            {debtOptions.map(asset => (
              <option key={asset.address} value={asset.address}>
                {asset.symbol}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="input input-bordered input-sm w-full"
            placeholder="Flash loan amount"
            value={flashAmount}
            onChange={e => setFlashAmount(e.target.value)}
          />
          <div className="text-xs text-base-content/60 flex items-center gap-2">
            <FiZap className="w-4 h-4" />
            <span>
              Min collateral from swap: <span className="font-mono">{minCollateralOut.formatted}</span>
            </span>
          </div>
          <label className="label">
            <span className="label-text text-xs">Slippage (%)</span>
            <input
              type="number"
              min={0}
              step={0.1}
              className="input input-bordered input-xs w-24"
              value={slippage}
              onChange={e => setSlippage(parseFloat(e.target.value) || 0)}
            />
          </label>
          {isSwapQuoteLoading && <p className="text-xs text-base-content/50">Fetching swap quote...</p>}
        </div>

        <div className="bg-base-200/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-base-content/70">
            <span>Flash Loan Provider</span>
            <span className="text-[11px] text-base-content/50">
              Liquidity {selectedLiquidity ? (selectedLiquidity.hasLiquidity ? "sufficient" : "insufficient") : "checking"}
            </span>
          </div>
          <select
            className="select select-sm w-full"
            value={selectedProvider?.name ?? providerOptions[0]?.name}
            onChange={e => {
              const option = providerOptions.find(p => p.name === e.target.value);
              if (option) setSelectedProvider(option);
            }}
          >
            {providerOptions.map(provider => (
              <option key={provider.name} value={provider.name}>
                {provider.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs text-warning">
          <FiAlertTriangle className="w-4 h-4" />
          <span>Ensure your target LTV stays below protocol limits before confirming.</span>
        </div>

        <div className="border-t border-base-300 pt-3 space-y-2">
          <label className="label cursor-pointer gap-2 justify-start">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={!!preferBatching}
              onChange={e => setPreferBatching(e.target.checked)}
              disabled={!isPreferenceLoaded}
            />
            <span className="label-text text-xs">Batch transaction with smart account</span>
          </label>

          <button
            className="btn btn-primary w-full"
            onClick={() => handleConfirm(initialCollateral || "0")}
            disabled={!collateral || !debt}
          >
            <FiPlus className="w-4 h-4" />
            <FiArrowDownCircle className="w-4 h-4" />
            <span>Multiply Position</span>
          </button>
        </div>
      </div>
    </BaseModal>
  );
};

export default MultiplyEvmModal;

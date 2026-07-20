"use client";

import { type FC, useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type Address, erc20Abi, formatUnits, parseUnits } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { ArrowTopRightOnSquareIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { BaseModal } from "~~/components/modals/BaseModal";
import type { MorphoMarket } from "~~/hooks/useMorphoLendingPositions";
import { qk } from "~~/lib/queryKeys";
import { MORPHO_ADDRESSES } from "~~/utils/chainConfig";
import { getMorphoMarketUrl } from "~~/utils/morpho";
import { notification } from "~~/utils/scaffold-eth/notification";

const MORPHO_BLUE_ABI = [
  {
    type: "function",
    name: "supply",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "marketParams",
        type: "tuple",
        components: [
          { name: "loanToken", type: "address" },
          { name: "collateralToken", type: "address" },
          { name: "oracle", type: "address" },
          { name: "irm", type: "address" },
          { name: "lltv", type: "uint256" },
        ],
      },
      { name: "assets", type: "uint256" },
      { name: "shares", type: "uint256" },
      { name: "onBehalf", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [
      { name: "assetsSupplied", type: "uint256" },
      { name: "sharesSupplied", type: "uint256" },
    ],
  },
] as const;

interface DirectMorphoSupplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  market: MorphoMarket;
  chainId: number;
  onSuccess?: () => void;
}

/**
 * Supplies the market's loan asset directly to Morpho Blue. This deliberately
 * bypasses KapanRouter: a Morpho loan-asset supply is a lender position, not
 * collateral, and must call `Morpho.supply` rather than `supplyCollateral`.
 */
export const DirectMorphoSupplyModal: FC<DirectMorphoSupplyModalProps> = ({
  isOpen,
  onClose,
  market,
  chainId,
  onSuccess,
}) => {
  const { address: account, chainId: walletChainId } = useAccount();
  const queryClient = useQueryClient();
  const publicClient = usePublicClient({ chainId });
  const { writeContractAsync } = useWriteContract();
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const morphoAddress = MORPHO_ADDRESSES[chainId];
  const loan = market.loanAsset;

  const parsedAmount = useMemo(() => {
    try {
      return amount.trim() ? parseUnits(amount, loan.decimals) : 0n;
    } catch {
      return 0n;
    }
  }, [amount, loan.decimals]);

  const { data: walletBalance, refetch: refetchBalance } = useReadContract({
    address: loan.address as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    chainId,
    query: { enabled: Boolean(isOpen && account) },
  });
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: loan.address as Address,
    abi: erc20Abi,
    functionName: "allowance",
    args: account && morphoAddress ? [account, morphoAddress] : undefined,
    chainId,
    query: { enabled: Boolean(isOpen && account && morphoAddress) },
  });

  useEffect(() => {
    if (isOpen) setAmount("");
  }, [isOpen, market.uniqueKey]);

  const marketUrl = useMemo(
    () => getMorphoMarketUrl(chainId, market.uniqueKey, market.collateralAsset?.symbol ?? "", loan.symbol),
    [chainId, loan.symbol, market.collateralAsset?.symbol, market.uniqueKey],
  );
  const needsApproval = parsedAmount > 0n && (allowance ?? 0n) < parsedAmount;
  const isWrongNetwork = Boolean(account && walletChainId !== chainId);
  const exceedsBalance = walletBalance !== undefined && parsedAmount > walletBalance;
  const canSubmit = Boolean(
    account && morphoAddress && parsedAmount > 0n && !isWrongNetwork && !exceedsBalance && !isSubmitting,
  );

  const setMaxAmount = useCallback(() => {
    if (walletBalance !== undefined) setAmount(formatUnits(walletBalance, loan.decimals));
  }, [loan.decimals, walletBalance]);

  const handleSubmit = useCallback(async () => {
    if (!account || !morphoAddress || !publicClient || !canSubmit) return;

    try {
      setIsSubmitting(true);
      if (needsApproval) {
        const approvalHash = await writeContractAsync({
          address: loan.address as Address,
          abi: erc20Abi,
          functionName: "approve",
          args: [morphoAddress, parsedAmount],
          chainId,
        });
        notification.info("Approval submitted. Waiting for confirmation…");
        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
        await refetchAllowance();
      }

      const hash = await writeContractAsync({
        address: morphoAddress,
        abi: MORPHO_BLUE_ABI,
        functionName: "supply",
        args: [
          {
            loanToken: loan.address as Address,
            collateralToken: (market.collateralAsset?.address ??
              "0x0000000000000000000000000000000000000000") as Address,
            oracle: (market.oracle?.address ?? "0x0000000000000000000000000000000000000000") as Address,
            irm: market.irmAddress as Address,
            lltv: BigInt(market.lltv),
          },
          parsedAmount,
          0n,
          account,
          "0x",
        ],
        chainId,
      });
      notification.info("Supply submitted. Waiting for confirmation…");
      await publicClient.waitForTransactionReceipt({ hash });
      notification.success(`Supplied ${amount} ${loan.symbol} to Morpho Blue`);
      await Promise.all([refetchAllowance(), refetchBalance()]);
      await queryClient.invalidateQueries({ queryKey: qk.morpho.positions(chainId, account) });
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("[DirectMorphoSupplyModal] Failed to supply market", error);
      notification.error("Morpho supply failed or was rejected");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    account,
    amount,
    canSubmit,
    chainId,
    loan.address,
    loan.symbol,
    market,
    morphoAddress,
    needsApproval,
    onClose,
    onSuccess,
    parsedAmount,
    publicClient,
    queryClient,
    refetchAllowance,
    refetchBalance,
    writeContractAsync,
  ]);

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={`Supply ${loan.symbol}`}>
      <div className="space-y-4">
        <p className="text-base-content/65 text-sm leading-relaxed">
          Lend the market&apos;s <strong className="text-base-content">loan asset</strong> directly to Morpho Blue. This
          creates a lending position; it is not used as collateral and does not pass through KapanRouter.
        </p>
        <div className="border-base-300 bg-base-200/45 rounded-lg border p-3">
          <div className="text-base-content/45 text-[10px] font-semibold uppercase tracking-widest">Market</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="font-medium">
              {market.collateralAsset?.symbol ?? "?"}/{loan.symbol}
            </span>
            <span className="text-success font-mono text-sm tabular-nums">
              {(market.state.supplyApy * 100).toFixed(2)}% APY
            </span>
          </div>
        </div>
        <label className="block">
          <span className="text-base-content/55 text-[10px] font-semibold uppercase tracking-widest">Amount</span>
          <div className="border-base-300 bg-base-200/35 mt-1.5 flex items-center gap-2 rounded-lg border px-3 py-2 focus-within:border-primary/60">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={event => setAmount(event.target.value)}
              placeholder="0.00"
              className="min-w-0 flex-1 bg-transparent font-mono text-lg tabular-nums outline-none"
            />
            <span className="text-base-content/70 text-sm font-semibold">{loan.symbol}</span>
            <button type="button" className="text-primary text-xs font-semibold" onClick={setMaxAmount}>
              MAX
            </button>
          </div>
          <div className="text-base-content/45 mt-1 flex justify-between text-xs">
            <span>Wallet balance</span>
            <span className="font-mono tabular-nums">
              {walletBalance === undefined ? "—" : `${formatUnits(walletBalance, loan.decimals)} ${loan.symbol}`}
            </span>
          </div>
        </label>
        {isWrongNetwork && (
          <p className="text-warning text-xs">Switch your wallet to this market&apos;s network before supplying.</p>
        )}
        {exceedsBalance && <p className="text-error text-xs">Amount exceeds your wallet balance.</p>}
        {!morphoAddress && (
          <p className="text-error text-xs">Direct Morpho supply is not configured for this network.</p>
        )}
        <button type="button" onClick={handleSubmit} disabled={!canSubmit} className="btn btn-primary w-full">
          {isSubmitting ? "Confirming…" : needsApproval ? `Approve ${loan.symbol} & supply` : `Supply ${loan.symbol}`}
        </button>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-base-content/45 flex items-center gap-1">
            <CheckCircleIcon className="size-3.5 text-success" /> Direct Morpho Blue transaction
          </span>
          {marketUrl && (
            <a
              className="text-primary inline-flex items-center gap-1 hover:underline"
              href={marketUrl}
              target="_blank"
              rel="noreferrer"
            >
              View market <ArrowTopRightOnSquareIcon className="size-3" />
            </a>
          )}
        </div>
      </div>
    </BaseModal>
  );
};

"use client";

import { FC, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { BaseModal } from "../BaseModal";
import {
  CairoCustomEnum,
  CairoOption,
  CairoOptionVariant,
  CallData,
  uint256,
} from "starknet";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";
import { useLendingAuthorizations } from "~~/hooks/useLendingAuthorizations";
import {
  useScaffoldContract,
  useScaffoldMultiWriteContract,
} from "~~/hooks/scaffold-stark";
import { notification } from "~~/utils/scaffold-stark";
import { formatTokenAmount } from "~~/utils/protocols";

const FEE_Q128 = 1n << 128n;

interface EkuboTier {
  feePercent: number;
  precisionPercent: number;
  tickSpacing: number;
  feeFelt: bigint;
  extension: bigint;
}

interface TokenInfo {
  name: string;
  address: string;
  decimals: number;
  icon: string;
}

interface ClosePositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  collateral: TokenInfo;
  debt: TokenInfo;
  collateralBalance: bigint;
  debtBalance: bigint;
  poolId: bigint;
}

export const ClosePositionModalStark: FC<ClosePositionModalProps> = ({
  isOpen,
  onClose,
  collateral,
  debt,
  collateralBalance,
  debtBalance,
  poolId,
}) => {
  const { address } = useStarkAccount();
  const { getAuthorizations, isReady: isAuthReady } = useLendingAuthorizations();

  const { data: ekuboGateway } = useScaffoldContract({
    contractName: "EkuboGateway",
  });

  const [tiers, setTiers] = useState<EkuboTier[]>([]);
  const [chosenTierIndex, setChosenTierIndex] = useState(0);
  const chosenTier = tiers[chosenTierIndex];
  const [isAutoSelecting, setIsAutoSelecting] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);

  const [fetchedAuthorizations, setFetchedAuthorizations] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const fetchPools = async () => {
      try {
        const a = BigInt(collateral.address);
        const b = BigInt(debt.address);
        const [token0, token1] = a < b
          ? [collateral.address, debt.address]
          : [debt.address, collateral.address];
        const resp = await fetch(
          `https://starknet-mainnet-api.ekubo.org/pair/${token0}/${token1}/pools`,
        );
        const json = await resp.json();
        const poolData = (json.topPools || [])
          .filter((p: any) => p.fee !== "0")
          .filter((p: any) => p.depth_percent == null || p.depth_percent > 0);
        poolData.sort(
          (a: any, b: any) =>
            Number(b.depth_percent || 0) - Number(a.depth_percent || 0),
        );
        const pools: EkuboTier[] = poolData.map((p: any) => {
          const feeFelt = BigInt(p.fee);
          const tickSpacing = Number(p.tick_spacing);
          return {
            feePercent: Number((feeFelt * 10000n) / FEE_Q128) / 100,
            precisionPercent: tickSpacing / 10000,
            tickSpacing,
            feeFelt,
            extension: BigInt(p.extension || "0"),
          } as EkuboTier;
        });
        if (!cancelled && pools.length > 0) {
          setTiers(pools);
          setChosenTierIndex(0);
          setIsAutoSelecting(true);
        }
      } catch (e) {
        console.error("failed to fetch Ekubo pools", e);
        if (!cancelled) setTiers([]);
      }
    };
    fetchPools();
    return () => {
      cancelled = true;
    };
  }, [isOpen, collateral.address, debt.address]);

  useEffect(() => {
    if (
      !isOpen ||
      !ekuboGateway ||
      !isAutoSelecting ||
      tiers.length === 0
    )
      return;
    let cancelled = false;
    const simulate = async () => {
      setIsSimulating(true);
      let bestIndex = 0;
      let bestAmount = 0n;
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        if (cancelled) break;
        try {
          const context = new CairoOption(
            CairoOptionVariant.Some,
            [tier.feeFelt, BigInt(tier.tickSpacing), tier.extension],
          );
          const swapInstruction = new CairoCustomEnum({
            Deposit: undefined,
            Borrow: undefined,
            Repay: undefined,
            Withdraw: undefined,
            Redeposit: undefined,
            Reborrow: undefined,
            Swap: undefined,
            SwapExactIn: {
              token_in: collateral.address,
              token_out: debt.address,
              exact_in: uint256.bnToUint256(collateralBalance),
              min_out: uint256.bnToUint256(0n),
              user: address || "0x0",
              should_pay_out: false,
              should_pay_in: false,
              context,
            },
            Reswap: undefined,
          });
          const call = (ekuboGateway as any).populate(
            "process_instructions",
            [[swapInstruction]],
          );
          const { result } = await (ekuboGateway.provider as any).callContract(call);
          const res: any = (ekuboGateway as any).parseResponse(
            "process_instructions",
            result,
          );
          const outs = res?.[0] || [];
          const out = outs.find((o: any) => o.token === debt.address);
          const amount = out
            ? BigInt(uint256.uint256ToBN(out.balance).toString())
            : 0n;
          if (amount > bestAmount) {
            bestAmount = amount;
            bestIndex = i;
          }
        } catch (e) {
          console.error("tier simulation failed", e);
        }
      }
      if (!cancelled) {
        setChosenTierIndex(bestIndex);
        setIsSimulating(false);
        setIsAutoSelecting(false);
      }
    };
    simulate();
    return () => {
      cancelled = true;
      setIsSimulating(false);
    };
  }, [
    isOpen,
    ekuboGateway,
    collateral.address,
    debt.address,
    collateralBalance,
    address,
    isAutoSelecting,
    tiers,
  ]);

  const protocolInstructions = useMemo(() => {
    if (!address || !chosenTier) return [];

    const repayContext = new CairoOption(
      CairoOptionVariant.Some,
      [poolId, collateral.address],
    );
    const withdrawContext = new CairoOption(
      CairoOptionVariant.Some,
      [poolId, debt.address],
    );

    const repayAmount = debtBalance > 0n ? debtBalance : 1n;

    const repayInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: {
        basic: { token: debt.address, amount: uint256.bnToUint256(repayAmount), user: address },
        repay_all: true,
        context: repayContext,
      },
      Withdraw: undefined,
      Redeposit: undefined,
      Reborrow: undefined,
      Swap: undefined,
      SwapExactIn: undefined,
      Reswap: undefined,
    });

    const withdrawInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: undefined,
      Withdraw: {
        basic: { token: collateral.address, amount: uint256.bnToUint256(collateralBalance), user: address },
        withdraw_all: true,
        context: withdrawContext,
      },
      Redeposit: undefined,
      Reborrow: undefined,
      Swap: undefined,
      SwapExactIn: undefined,
      Reswap: undefined,
    });

    const reswapInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: undefined,
      Withdraw: undefined,
      Redeposit: undefined,
      Reborrow: undefined,
      Swap: undefined,
      SwapExactIn: undefined,
      Reswap: {
        exact_out: { instruction_index: 0, output_index: 0 },
        max_in: { instruction_index: 1, output_index: 0 },
        user: address,
        should_pay_out: false,
        should_pay_in: true,
        context: new CairoOption(
          CairoOptionVariant.Some,
          [chosenTier.feeFelt, BigInt(chosenTier.tickSpacing), chosenTier.extension],
        ),
      },
    });

    return [
      { protocol_name: "vesu", instructions: [repayInstruction, withdrawInstruction] },
      { protocol_name: "ekubo", instructions: [reswapInstruction] },
    ];
  }, [
    address,
    collateral.address,
    debt.address,
    poolId,
    collateralBalance,
    debtBalance,
    chosenTier,
  ]);

  useEffect(() => {
    let cancelled = false;
    const fetchAuths = async () => {
      if (!isOpen || !isAuthReady || protocolInstructions.length === 0) {
        setFetchedAuthorizations([]);
        return;
      }
      try {
        const auths = await getAuthorizations(protocolInstructions as any);
        if (!cancelled) setFetchedAuthorizations(auths);
      } catch {
        if (!cancelled) setFetchedAuthorizations([]);
      }
    };
    fetchAuths();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isAuthReady, getAuthorizations, protocolInstructions]);

  const calls = useMemo(() => {
    if (protocolInstructions.length === 0) return [];
    return [
      ...(fetchedAuthorizations as any),
      {
        contractName: "RouterGateway" as const,
        functionName: "move_debt" as const,
        args: CallData.compile({ instructions: protocolInstructions }),
      },
    ];
  }, [fetchedAuthorizations, protocolInstructions]);

  const { sendAsync } = useScaffoldMultiWriteContract({ calls });

  const handleClosePosition = async () => {
    try {
      await sendAsync();
      notification.success("Position closed");
      onClose();
    } catch (e) {
      console.error(e);
      notification.error("Failed to close position");
    }
  };

  const formattedCollateral = formatTokenAmount(
    collateralBalance.toString(),
    collateral.decimals,
  );
  const formattedDebt = formatTokenAmount(debtBalance.toString(), debt.decimals);

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} maxWidthClass="max-w-md">
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-bold">Close Position</h3>
        <div className="flex justify-between items-start">
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-2">
              <Image
                src={collateral.icon}
                alt={collateral.name}
                width={24}
                height={24}
                className="w-6 h-6"
              />
              <span className="font-medium">{collateral.name}</span>
            </div>
            <span className="text-sm text-gray-500">
              {formattedCollateral} {collateral.name}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2">
              <Image
                src={debt.icon}
                alt={debt.name}
                width={24}
                height={24}
                className="w-6 h-6"
              />
              <span className="font-medium">{debt.name}</span>
            </div>
            <span className="text-sm text-gray-500">
              {formattedDebt} {debt.name}
            </span>
          </div>
        </div>
        <p className="text-sm">
          Repay your {debt.name} debt using {collateral.name} collateral via Ekubo swap.
        </p>
        <div className="text-sm flex items-center gap-2">
          <span>Ekubo tier:</span>
          <select
            className="select select-bordered select-sm"
            value={chosenTierIndex}
            onChange={e => {
              const idx = Number(e.target.value);
              if (!Number.isNaN(idx)) {
                setIsAutoSelecting(false);
                setIsSimulating(false);
                setChosenTierIndex(idx);
              }
            }}
          >
            {tiers.map((t, i) => (
              <option key={`${t.feeFelt}-${t.tickSpacing}-${t.extension}`} value={i}>
                {t.feePercent}% fee / {t.precisionPercent}% precision
              </option>
            ))}
          </select>
          {isSimulating && <span className="loading loading-spinner loading-sm" />}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleClosePosition}>
            Close Position
          </button>
        </div>
      </div>
    </BaseModal>
  );
};


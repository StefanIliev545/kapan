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

const EKUBO_TIERS = [
  {
    feePercent: 0.01,
    precisionPercent: 0.002,
    fee: 34028236692093846346337460743176821n,
    tickSpacing: 20,
  },
  {
    feePercent: 0.05,
    precisionPercent: 0.1,
    fee: 170141183460469231731687303715884105n,
    tickSpacing: 1000,
  },
  {
    feePercent: 0.3,
    precisionPercent: 0.6,
    fee: 1020847100762815390390123822295304634n,
    tickSpacing: 3000,
  },
  {
    feePercent: 1,
    precisionPercent: 2,
    fee: 3402823669209384634633746074317682114n,
    tickSpacing: 10000,
  },
  {
    feePercent: 5,
    precisionPercent: 10,
    fee: 17014118346046923173168730371588410572n,
    tickSpacing: 50000,
  },
];

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

  const defaultTier = EKUBO_TIERS[1];
  const [chosenTier, setChosenTier] = useState(defaultTier);

  const [withdrawAfterClose, setWithdrawAfterClose] = useState(true);
  const [fetchedAuthorizations, setFetchedAuthorizations] = useState<any[]>([]);

  useEffect(() => {
    if (!isOpen || !ekuboGateway) return;
    const simulate = async () => {
      let bestTier = defaultTier;
      let bestAmount = 0n;
      for (const tier of EKUBO_TIERS) {
        try {
          const context = new CairoOption(
            CairoOptionVariant.Some,
            [tier.fee, BigInt(tier.tickSpacing), 0n],
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
          const res: any = await (ekuboGateway as any).call(
            "process_instructions",
            [[swapInstruction]],
          );
          const outs = res?.[0] || [];
          const out = outs.find((o: any) => o.token === debt.address);
          const amount = out
            ? BigInt(uint256.uint256ToBN(out.balance).toString())
            : 0n;
          if (amount > bestAmount) {
            bestAmount = amount;
            bestTier = tier;
          }
        } catch (e) {
          console.error("tier simulation failed", e);
        }
      }
      setChosenTier(bestTier);
    };
    simulate();
  }, [
    isOpen,
    ekuboGateway,
    collateral.address,
    debt.address,
    collateralBalance,
    address,
  ]);

  const protocolInstructions = useMemo(() => {
    if (!address) return [];

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
          [chosenTier.fee, BigInt(chosenTier.tickSpacing), 0n],
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
        {chosenTier && (
          <p className="text-sm">
            Best tier: {chosenTier.feePercent}% fee / {chosenTier.precisionPercent}% precision
          </p>
        )}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={withdrawAfterClose}
            onChange={e => setWithdrawAfterClose(e.target.checked)}
          />
          <span className="text-sm">Withdraw remaining collateral</span>
        </label>
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


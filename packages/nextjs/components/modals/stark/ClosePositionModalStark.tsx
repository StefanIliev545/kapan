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
import { useScaffoldMultiWriteContract } from "~~/hooks/scaffold-stark";
import { notification } from "~~/utils/scaffold-stark";
import { formatTokenAmount } from "~~/utils/protocols";

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

  const [withdrawAfterClose, setWithdrawAfterClose] = useState(true);
  const [fetchedAuthorizations, setFetchedAuthorizations] = useState<any[]>([]);

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
        context: new CairoOption(CairoOptionVariant.None),
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


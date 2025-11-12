import { CairoCustomEnum, CairoOption, CairoOptionVariant, CallData, uint256 } from "starknet";
import { normalizeStarknetAddress } from "~~/utils/vesu";
import type { Allocation } from "./useDebtAllocations";

const MAX_UINT = (1n << 256n) - 1n;
const toOutputPointer = (i: number) => ({ instruction_index: BigInt(i), output_index: 0n });

type BuildMoveInstructionsParams = {
  rows: Allocation[];
  lastNonZeroIndex: number;
  fromProtocol: string;
  toProtocol: string;
  selectedVersion: "v1" | "v2";
  position: {
    tokenAddress: string;
    decimals: number;
    poolId?: bigint | string;
  };
  selectedPoolId: bigint;
  selectedV2PoolAddress: string;
  starkUserAddress: string;
  isDebtMaxClicked: boolean;
};

export function buildMoveInstructions(params: BuildMoveInstructionsParams) {
  const {
    rows,
    lastNonZeroIndex,
    fromProtocol,
    toProtocol,
    selectedVersion,
    position,
    selectedPoolId,
    selectedV2PoolAddress,
    starkUserAddress,
    isDebtMaxClicked,
  } = params;

  if (rows.length === 0) {
    return { pairInstructions: [], authInstructions: [], authCalldataKey: "" };
  }

  const sourceName = fromProtocol === "VesuV2" ? "vesu_v2" : fromProtocol.toLowerCase();
  const targetName =
    toProtocol === "Vesu"
      ? selectedVersion === "v2"
        ? "vesu_v2"
        : "vesu"
      : toProtocol.toLowerCase();

  // Final result: [ source{repay,withdraw}, target{redeposit,reborrow}, source{...}, target{...}, ... ]
  const protocolInstructions: { protocol_name: string; instructions: CairoCustomEnum[] }[] = [];

  // Auths: all source Withdraws & all target Reborrows
  const authSourceWithdraw: CairoCustomEnum[] = [];
  const authTargetReborrow: CairoCustomEnum[] = [];

  // Global instruction index across ALL protocolInstructions, in execution order.
  // This must match the order that RouterGateway.process_protocol_instructions_internal will execute them,
  // because OutputPointer.instruction_index indexes into the flat all_outputs array.
  let globalInstructionIndex = 0;

  // Source pool context (if any)
  let srcPool: bigint | null = null;
  if (fromProtocol === "Vesu") {
    srcPool =
      typeof position.poolId === "string"
        ? BigInt(position.poolId)
        : position.poolId ?? 0n;
  } else if (fromProtocol === "VesuV2") {
    srcPool = BigInt(
      normalizeStarknetAddress(
        (position.poolId as string | undefined) ?? selectedV2PoolAddress,
      ),
    );
  }

  // Precompute V2 pool address (used when toProtocol is Vesu v2 or VesuV2)
  const dstV2Pool =
    toProtocol === "Vesu" || toProtocol === "VesuV2"
      ? BigInt(normalizeStarknetAddress(selectedV2PoolAddress))
      : 0n; // ignored otherwise

  const bump = (x: bigint) => ((x * 101n) / 100n) + 1n;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    //
    // -------- SOURCE: [Repay_i, Withdraw_i] --------
    //
    const repayAmt = row.repayAmount;
    const repayAll = isDebtMaxClicked && i === lastNonZeroIndex;

    const repayCtx =
      srcPool !== null
        ? new CairoOption<bigint[]>(CairoOptionVariant.Some, [
            srcPool,
            BigInt(row.address),
          ])
        : new CairoOption<bigint[]>(CairoOptionVariant.None);

    const withdrawCtx =
      srcPool !== null
        ? new CairoOption<bigint[]>(CairoOptionVariant.Some, [
            srcPool,
            BigInt(position.tokenAddress),
          ])
        : new CairoOption<bigint[]>(CairoOptionVariant.None);

    const repayInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: {
        basic: {
          token: position.tokenAddress,
          amount: uint256.bnToUint256(repayAmt),
          user: starkUserAddress,
        },
        repay_all: repayAll,
        context: repayCtx,
      },
      Withdraw: undefined,
      Redeposit: undefined,
      Reborrow: undefined,
    });
    const repayIndexGlobal = globalInstructionIndex;
    globalInstructionIndex += 1;

    const withdrawAmount = row.isMax ? bump(row.rawBalance) : row.amountRaw;
    const withdrawInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: undefined,
      Withdraw: {
        basic: {
          token: row.address,
          amount: uint256.bnToUint256(withdrawAmount),
          user: starkUserAddress,
        },
        withdraw_all: row.isMax,
        context: withdrawCtx,
      },
      Redeposit: undefined,
      Reborrow: undefined,
    });
    const withdrawIndexGlobal = globalInstructionIndex;
    globalInstructionIndex += 1;

    authSourceWithdraw.push(withdrawInstruction);

    protocolInstructions.push({
      protocol_name: sourceName,
      instructions: [repayInstruction, withdrawInstruction],
    });

    //
    // -------- TARGET: [Redeposit_i, Reborrow_i] --------
    //
    let depositCtx: CairoOption<bigint[]> = new CairoOption<bigint[]>(
      CairoOptionVariant.None,
    );
    let borrowCtx: CairoOption<bigint[]> = new CairoOption<bigint[]>(
      CairoOptionVariant.None,
    );

    if (toProtocol === "Vesu") {
      if (selectedVersion === "v1") {
        depositCtx = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
          selectedPoolId,
          BigInt(position.tokenAddress),
        ]);
        borrowCtx = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
          selectedPoolId,
          BigInt(row.address),
        ]);
      } else {
        // Vesu v2
        depositCtx = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
          dstV2Pool,
          BigInt(position.tokenAddress),
        ]);
        borrowCtx = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
          dstV2Pool,
          BigInt(row.address),
        ]);
      }
    } else if (toProtocol === "VesuV2") {
      depositCtx = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
        dstV2Pool,
        BigInt(position.tokenAddress),
      ]);
      borrowCtx = new CairoOption<bigint[]>(CairoOptionVariant.Some, [
        dstV2Pool,
        BigInt(row.address),
      ]);
    }

    // Pointers use the *global* instruction indices of this row's source instructions.
    const withdrawPtr = toOutputPointer(withdrawIndexGlobal);
    const repayPtr = toOutputPointer(repayIndexGlobal);

    const redepositInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: undefined,
      Withdraw: undefined,
      Redeposit: {
        token: row.address,
        target_output_pointer: withdrawPtr,
        user: starkUserAddress,
        context: depositCtx,
      },
      Reborrow: undefined,
    });

    const reborrowApproval =
      isDebtMaxClicked && i === lastNonZeroIndex
        ? MAX_UINT
        : ((row.repayAmount * 101n) / 100n) + 1n;

    const reborrowInstruction = new CairoCustomEnum({
      Deposit: undefined,
      Borrow: undefined,
      Repay: undefined,
      Withdraw: undefined,
      Redeposit: undefined,
      Reborrow: {
        token: position.tokenAddress,
        target_output_pointer: repayPtr,
        approval_amount: uint256.bnToUint256(reborrowApproval),
        user: starkUserAddress,
        context: borrowCtx,
      },
    });

    authTargetReborrow.push(reborrowInstruction);

    protocolInstructions.push({
      protocol_name: targetName,
      instructions: [redepositInstruction, reborrowInstruction],
    });

    // We don't need the indexes of redeposit/reborrow later, but they still occupy slots in all_outputs.
    globalInstructionIndex += 2;
  }

  const authInstructions = [
    authSourceWithdraw.length > 0
      ? { protocol_name: sourceName, instructions: authSourceWithdraw }
      : null,
    authTargetReborrow.length > 0
      ? { protocol_name: targetName, instructions: authTargetReborrow }
      : null,
  ].filter(
    (b): b is { protocol_name: string; instructions: CairoCustomEnum[] } =>
      b !== null,
  );

  const pairProtocolNames = protocolInstructions.map(p => p.protocol_name);
  const authProtocolNames = authInstructions.map(p => p.protocol_name);
  console.log("[buildMoveInstructions] pair protocols:", pairProtocolNames);
  console.log("[buildMoveInstructions] auth protocols:", authProtocolNames);

  return {
    // One "pair" containing [source_i, target_i, source_j, target_j, ...]
    pairInstructions: [protocolInstructions],
    authInstructions,
    authCalldataKey: JSON.stringify(
      CallData.compile({ instructions: authInstructions, rawSelectors: false }),
    ),
  };
}

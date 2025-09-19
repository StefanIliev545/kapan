import { useCallback, useMemo } from "react";
import {
  usePaymasterSendTransaction,
  type UsePaymasterSendTransactionResult,
} from "@starknet-react/core";
import {
  CairoCustomEnum,
  CairoOption,
  CairoOptionVariant,
  Call,
  CallData,
  InvokeFunctionResponse,
  PaymasterDetails,
  PaymasterFeeEstimate,
  uint256,
  type BigNumberish,
} from "starknet";
import { useAccount } from "~~/hooks/useAccount";
import { useDeployedContractInfo } from "~~/hooks/scaffold-stark";
import {
  useLendingAuthorizations,
  type BaseProtocolInstruction,
} from "~~/hooks/useLendingAuthorizations";

type BaseFeeMode = { mode: "default"; gasToken: string };

type ExtendedMode = "default" | "collateral" | "borrow";

interface VesuContext {
  poolId: bigint;
  counterpartToken: string;
}

interface CustomModeContext {
  mode: "collateral" | "borrow";
  gasTokenAddress: string;
  protocolName: string;
  amount: bigint;
  useMax?: boolean;
  vesuContext?: VesuContext;
}

export interface UseProtocolPaymasterSendTransactionArgs {
  /** List of smart contract calls to execute. */
  calls?: Call[];
  /** Desired execution mode. */
  mode?: ExtendedMode;
  /** Gas token to be used when mode requires it. */
  gasToken?: string;
  /** Amount of gas token to source when using custom modes. */
  amount?: bigint;
  /** Lending protocol identifier understood by the RouterGateway. */
  protocol?: string;
  /** Withdraw entire balance toggle for collateral mode. */
  useMax?: boolean;
  /** Optional Vesu context for future integrations. */
  vesuContext?: VesuContext;
  /** Additional paymaster configuration (deploymentData, timeBounds, ...). */
  paymasterOptions?: Omit<PaymasterDetails, "feeMode">;
  /** Max fee expressed in selected gas token. */
  maxFeeInGasToken?: BigNumberish;
}

export type UseProtocolPaymasterSendTransactionResult = Omit<
  UsePaymasterSendTransactionResult,
  "send" | "sendAsync" | "estimateFee"
> & {
  send: (userCalls?: Call[], overrides?: PaymasterOverrides) => void;
  sendAsync: (userCalls?: Call[], overrides?: PaymasterOverrides) => Promise<InvokeFunctionResponse>;
  prepareCalls: (calls?: Call[], overrides?: PaymasterOverrides) => Promise<Call[]>;
  estimateFee: (calls?: Call[], overrides?: PaymasterOverrides) => Promise<PaymasterFeeEstimate>;
};

type PaymasterOverrides = Partial<Pick<CustomModeContext, "amount" | "useMax" | "vesuContext">>;

const ensureHexAddress = (address?: string) => {
  if (!address) throw new Error("Gas token address is required for this paymaster mode");
  if (!address.startsWith("0x")) {
    throw new Error(`Gas token must be a hex string. Received: ${address}`);
  }
  return address.toLowerCase();
};

const normalizeProtocolName = (protocol?: string) => {
  if (!protocol) throw new Error("Protocol name is required for this paymaster mode");
  return protocol.toLowerCase();
};

const buildBaseInstruction = (context: CustomModeContext, userAddress: string): BaseProtocolInstruction => {
  const basic = {
    token: context.gasTokenAddress,
    amount: uint256.bnToUint256(context.amount),
    user: userAddress,
  };

  let instructionContext = new CairoOption(CairoOptionVariant.None);
  if (context.vesuContext) {
    instructionContext = new CairoOption(
      CairoOptionVariant.Some,
      [context.vesuContext.poolId, context.vesuContext.counterpartToken],
    );
  }

  const withdrawVariant = {
    basic,
    withdraw_all: Boolean(context.useMax),
    context: instructionContext,
  } as const;

  const borrowVariant = {
    basic,
    context: instructionContext,
  } as const;

  const lendingInstruction =
    context.mode === "collateral"
      ? new CairoCustomEnum({
          Deposit: undefined,
          Borrow: undefined,
          Repay: undefined,
          Withdraw: withdrawVariant,
        })
      : new CairoCustomEnum({
          Deposit: undefined,
          Borrow: borrowVariant,
          Repay: undefined,
          Withdraw: undefined,
        });

  return {
    protocol_name: context.protocolName,
    instructions: [lendingInstruction],
  };
};

export const useProtocolPaymasterSendTransaction = (
  args: UseProtocolPaymasterSendTransactionArgs,
): UseProtocolPaymasterSendTransactionResult => {
  const {
    calls,
    mode = "default",
    gasToken,
    amount,
    protocol,
    useMax,
    vesuContext,
    paymasterOptions,
    maxFeeInGasToken,
  } = args;

  const { account } = useAccount();
  const { data: routerGateway } = useDeployedContractInfo("RouterGateway");
  const { getAuthorizations } = useLendingAuthorizations();

  const { baseFeeMode, customContext } = useMemo(() => {
    const gasTokenAddress = ensureHexAddress(gasToken);

    if (mode === "collateral" || mode === "borrow") {
      if (amount === undefined || amount <= 0n) {
        throw new Error("A positive amount is required for collateral or borrow modes");
      }

      const protocolName = normalizeProtocolName(protocol);

      return {
        baseFeeMode: { mode: "default", gasToken: gasTokenAddress } as BaseFeeMode,
        customContext: {
          mode,
          gasTokenAddress,
          protocolName,
          amount,
          useMax,
          vesuContext,
        } satisfies CustomModeContext,
      };
    }

    return { baseFeeMode: { mode: "default", gasToken: gasTokenAddress } as BaseFeeMode, customContext: null };
  }, [mode, gasToken, amount, protocol, useMax, vesuContext]);

  const paymasterDetails: PaymasterDetails = useMemo(
    () => ({
      ...(paymasterOptions ?? {}),
      feeMode: baseFeeMode,
    }),
    [paymasterOptions, baseFeeMode],
  );

  const resolveContext = useCallback(
    (overrides?: PaymasterOverrides): CustomModeContext | null => {
      if (!customContext) return null;
      if (!overrides) return customContext;

      const nextContext: CustomModeContext = {
        ...customContext,
        ...(overrides.amount !== undefined ? { amount: overrides.amount } : {}),
        ...(overrides.useMax !== undefined ? { useMax: overrides.useMax } : {}),
        ...(overrides.vesuContext !== undefined ? { vesuContext: overrides.vesuContext } : {}),
      };

      return nextContext;
    },
    [customContext],
  );

  const baseResult = usePaymasterSendTransaction({
    calls,
    options: paymasterDetails,
    maxFeeInGasToken,
  });

  const { send: _baseSend, sendAsync: baseSendAsync, ...rest } = baseResult;
  void _baseSend;

  const prepareCalls = useCallback(
    async (userCalls?: Call[], overrides?: PaymasterOverrides) => {
      const mergedCalls = userCalls ?? calls ?? [];
      const formattedCalls = Array.isArray(mergedCalls) ? mergedCalls : [mergedCalls];

      const activeContext = resolveContext(overrides);

      if (!activeContext) {
        return formattedCalls;
      }

      if (!account?.address) {
        throw new Error("Account address is required to prepare protocol paymaster calls");
      }

      if (!routerGateway?.address) {
        throw new Error("RouterGateway contract information is required for custom paymaster modes");
      }

      if (activeContext.amount === undefined || activeContext.amount <= 0n) {
        throw new Error("A positive amount is required for protocol paymaster instructions");
      }

      const baseInstruction = buildBaseInstruction(activeContext, account.address);
      const authorizations = await getAuthorizations([baseInstruction]);

      const authorizationCalls: Call[] = (authorizations || []).map(auth => ({
        contractAddress: auth.contractAddress,
        entrypoint: auth.entrypoint,
        calldata: auth.calldata,
      }));

      const hasProcessCall = authorizationCalls.some(call => {
        const contractAddress = call.contractAddress?.toLowerCase?.();
        return (
          contractAddress === routerGateway.address.toLowerCase() &&
          call.entrypoint === "process_protocol_instructions"
        );
      });

      const executeCall: Call | null = hasProcessCall
        ? null
        : {
            contractAddress: routerGateway.address,
            entrypoint: "process_protocol_instructions",
            calldata: CallData.compile({ instructions: [baseInstruction] }),
          };

      return [...formattedCalls, ...authorizationCalls, ...(executeCall ? [executeCall] : [])];
    },
    [account?.address, calls, getAuthorizations, resolveContext, routerGateway?.address],
  );

  const sendAsync = useCallback(
    async (userCalls?: Call[], overrides?: PaymasterOverrides) => {
      const finalCalls = await prepareCalls(userCalls, overrides);
      return baseSendAsync(finalCalls);
    },
    [baseSendAsync, prepareCalls],
  );

  const send = useCallback(
    (userCalls?: Call[], overrides?: PaymasterOverrides) => {
      void sendAsync(userCalls, overrides);
    },
    [sendAsync],
  );

  const estimateFee = useCallback(
    async (userCalls?: Call[], overrides?: PaymasterOverrides) => {
      if (!account) {
        throw new Error("Account address is required to estimate protocol paymaster fees");
      }
      const finalCalls = await prepareCalls(userCalls, overrides);
      return account.estimatePaymasterTransactionFee(finalCalls, paymasterDetails);
    },
    [account, prepareCalls, paymasterDetails],
  );

  return {
    send,
    sendAsync,
    prepareCalls,
    estimateFee,
    ...rest,
  };
};

export default useProtocolPaymasterSendTransaction;

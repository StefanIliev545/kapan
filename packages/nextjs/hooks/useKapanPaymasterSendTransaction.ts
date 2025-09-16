"use client";

import { useCallback, useMemo } from "react";
import {
  type AccountInterface,
  type Abi,
  type BigNumberish,
  type Call,
  CairoCustomEnum,
  CairoOption,
  CairoOptionVariant,
  CallData,
  Contract,
  num,
  uint256,
  type PaymasterDetails,
} from "starknet";
import {
  usePaymasterSendTransaction,
  type UsePaymasterSendTransactionArgs,
  type UsePaymasterSendTransactionResult,
} from "@starknet-react/core";
import { useAccount } from "~~/hooks/useAccount";
import { useDeployedContractInfo } from "~~/hooks/scaffold-stark";
import { feltToString } from "~~/utils/protocols";
import { universalEthAddress, universalStrkAddress } from "~~/utils/Constants";

const HEX_PREFIX = "0x";

export const DEFAULT_GAS_TOKEN_MAP: Record<string, string> = {
  strk: universalStrkAddress,
  eth: universalEthAddress,
};

export type GasTokenResolver = (tokenId: string) => string | undefined;

export interface KapanInstructionContext {
  values?: Array<BigNumberish | string>;
  poolId?: BigNumberish;
  counterpartToken?: string;
}

export interface KapanCallBuilderArgs {
  account?: AccountInterface;
  accountAddress: string;
  routerAddress?: string;
  routerAbi?: Abi;
  gasTokenAddress: string;
  amount: bigint;
  withdrawAll: boolean;
  protocolName: string;
  contextValues?: Array<BigNumberish | string>;
  userCalls: Call[];
  mode: "collateral" | "borrow";
}

export type KapanCallBuilder = (args: KapanCallBuilderArgs) => Promise<Call[]>;

interface KapanModeBase {
  protocol?: string;
  lendingProtocol: string;
  gasToken: string;
  amount: BigNumberish;
  context?: KapanInstructionContext;
  accountAddress?: string;
  routerAddress?: string;
  tokenAddressMap?: Record<string, string>;
  buildAdditionalCalls?: KapanCallBuilder;
}

export interface KapanCollateralFeeMode extends KapanModeBase {
  mode: "collateral";
  withdrawAll?: boolean;
}

export interface KapanBorrowFeeMode extends KapanModeBase {
  mode: "borrow";
}

export type ExtendedFeeMode =
  | PaymasterDetails["feeMode"]
  | KapanCollateralFeeMode
  | KapanBorrowFeeMode;

export type ExtendedPaymasterDetails = Omit<PaymasterDetails, "feeMode"> & {
  feeMode: ExtendedFeeMode;
};

export type UseKapanPaymasterSendTransactionArgs = Omit<UsePaymasterSendTransactionArgs, "options"> & {
  options: ExtendedPaymasterDetails;
  tokenAddressMap?: Record<string, string>;
  resolveGasTokenAddress?: GasTokenResolver;
};

interface NormalizedKapanMode {
  mode: "collateral" | "borrow";
  aggregatorType: string;
  lendingProtocol: string;
  gasTokenAddress: string;
  amount: bigint;
  withdrawAll: boolean;
  contextValues?: Array<BigNumberish | string>;
  accountAddress?: string;
  routerAddress?: string;
  buildAdditionalCalls?: KapanCallBuilder;
}

interface NormalizedPaymasterConfig {
  options: PaymasterDetails;
  kapanMode: NormalizedKapanMode | null;
}

function mergeTokenMaps(
  ...maps: Array<Record<string, string> | undefined>
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const map of maps) {
    if (!map) continue;
    for (const [key, value] of Object.entries(map)) {
      if (!value) continue;
      merged[key.toLowerCase()] = value;
    }
  }
  return merged;
}

export function resolveGasToken(
  tokenId: string,
  resolver: GasTokenResolver | undefined,
  maps: Array<Record<string, string> | undefined>,
): string {
  if (!tokenId) throw new Error("Gas token identifier is required");
  const direct = resolver?.(tokenId);
  if (direct) return direct;
  if (tokenId.toLowerCase().startsWith(HEX_PREFIX)) {
    return tokenId;
  }
  const lower = tokenId.toLowerCase();
  for (const map of maps) {
    if (!map) continue;
    const found = map[lower];
    if (found) return found;
  }
  throw new Error(`Unable to resolve gas token identifier: ${tokenId}`);
}

function resolveContextValues(
  context?: KapanInstructionContext,
): Array<BigNumberish | string> | undefined {
  if (!context) return undefined;
  if (Array.isArray(context.values) && context.values.length > 0) {
    return context.values;
  }
  if (context.poolId !== undefined && context.counterpartToken !== undefined) {
    return [context.poolId, context.counterpartToken];
  }
  return undefined;
}

export function toBigInt(value: BigNumberish | undefined): bigint {
  if (value === undefined || value === null) {
    throw new Error("Amount is required for Kapan paymaster mode");
  }
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string") return BigInt(value);
  if (Array.isArray(value)) {
    if (value.length === 2) {
      const low = toBigInt(value[0] as BigNumberish);
      const high = toBigInt(value[1] as BigNumberish);
      return (high << 128n) + low;
    }
    throw new Error("Unsupported array format for BigNumberish value");
  }
  if (typeof value === "object") {
    if ("low" in value && "high" in value) {
      const low = toBigInt((value as any).low);
      const high = toBigInt((value as any).high);
      return (high << 128n) + low;
    }
  }
  throw new Error("Unsupported BigNumberish value");
}

export function normalizeExtendedPaymasterDetails(
  details: ExtendedPaymasterDetails,
  tokenAddressMap: Record<string, string> | undefined,
  resolver: GasTokenResolver | undefined,
): NormalizedPaymasterConfig {
  const { feeMode, ...rest } = details;

  if (feeMode.mode === "default" || feeMode.mode === "sponsored") {
    return {
      options: details as PaymasterDetails,
      kapanMode: null,
    };
  }

  if (feeMode.mode !== "collateral" && feeMode.mode !== "borrow") {
    throw new Error(`Unsupported paymaster mode: ${String((feeMode as any).mode)}`);
  }

  const maps = mergeTokenMaps(DEFAULT_GAS_TOKEN_MAP, tokenAddressMap, feeMode.tokenAddressMap);
  const gasTokenAddress = resolveGasToken(feeMode.gasToken, resolver, [maps]);
  const amount = toBigInt(feeMode.amount);
  const withdrawAll = feeMode.mode === "collateral" ? Boolean(feeMode.withdrawAll) : false;
  const aggregatorType = (feeMode.protocol ?? "kapan").toLowerCase();
  const contextValues = resolveContextValues(feeMode.context);

  const normalizedMode: NormalizedKapanMode = {
    mode: feeMode.mode,
    aggregatorType,
    lendingProtocol: feeMode.lendingProtocol,
    gasTokenAddress,
    amount,
    withdrawAll,
    contextValues,
    accountAddress: feeMode.accountAddress,
    routerAddress: feeMode.routerAddress,
    buildAdditionalCalls: feeMode.buildAdditionalCalls,
  };

  const normalizedOptions: PaymasterDetails = {
    ...(rest as Omit<PaymasterDetails, "feeMode">),
    feeMode: {
      mode: "default",
      gasToken: gasTokenAddress,
    },
  };

  return {
    options: normalizedOptions,
    kapanMode: normalizedMode,
  };
}

function normalizeCallInput(calls?: Call | Call[]): Call[] {
  if (!calls) return [];
  return Array.isArray(calls) ? calls : [calls];
}

export function parseAuthorizationResult(result: unknown): Call[] {
  const calls: Call[] = [];
  if (!Array.isArray(result)) return calls;
  for (const item of result as any[]) {
    if (!Array.isArray(item) || item.length < 3) continue;
    const [addrRaw, entryRaw, dataRaw] = item;
    const contractAddress = num.toHexString(addrRaw);
    const entrypoint =
      typeof entryRaw === "string"
        ? entryRaw
        : typeof entryRaw === "bigint"
        ? feltToString(entryRaw)
        : feltToString(BigInt(entryRaw ?? 0));
    const calldataArray = Array.isArray(dataRaw) ? dataRaw : [];
    const calldata = calldataArray.map(arg => num.toHexString(arg));
    calls.push({ contractAddress, entrypoint, calldata });
  }
  return calls;
}

async function defaultKapanCallBuilder({
  account,
  accountAddress,
  routerAddress,
  routerAbi,
  gasTokenAddress,
  amount,
  withdrawAll,
  protocolName,
  contextValues,
  mode,
}: KapanCallBuilderArgs): Promise<Call[]> {
  if (!account) throw new Error("Starknet account is required for Kapan paymaster mode");
  if (!routerAddress || !routerAbi) {
    throw new Error("Router gateway contract is required for Kapan paymaster mode");
  }

  const contract = new Contract(routerAbi, routerAddress, account);
  const basic = {
    token: gasTokenAddress,
    amount: uint256.bnToUint256(amount),
    user: accountAddress,
  };

  const option = contextValues && contextValues.length > 0
    ? new CairoOption(CairoOptionVariant.Some, contextValues)
    : new CairoOption(CairoOptionVariant.None);

  const lendingInstruction = new CairoCustomEnum({
    Deposit: undefined,
    Borrow: mode === "borrow" ? { basic, context: option } : undefined,
    Repay: undefined,
    Withdraw:
      mode === "collateral"
        ? { basic, withdraw_all: withdrawAll, context: option }
        : undefined,
  });

  const protocolInstruction = {
    protocol_name: protocolName.toLowerCase(),
    instructions: [lendingInstruction],
  };

  const fullInstruction = CallData.compile({ instructions: [protocolInstruction] });
  const authInstruction = CallData.compile({ instructions: [protocolInstruction], rawSelectors: false });

  const rawAuthorizations = await contract.call(
    "get_authorizations_for_instructions",
    authInstruction,
  );
  const authorizationCalls = parseAuthorizationResult(rawAuthorizations);

  authorizationCalls.push({
    contractAddress: routerAddress,
    entrypoint: "process_protocol_instructions",
    calldata: fullInstruction,
  });

  return authorizationCalls;
}

async function buildKapanModeCalls(
  normalized: NormalizedKapanMode,
  account: AccountInterface | undefined,
  accountAddress: string | undefined,
  routerContract: { address: string; abi: Abi } | undefined,
  userCalls: Call[],
): Promise<Call[]> {
  const resolvedAddress = normalized.accountAddress ?? accountAddress;
  if (!resolvedAddress) {
    throw new Error("Account address is required for Kapan paymaster mode");
  }

  const builder = normalized.buildAdditionalCalls;
  if (builder) {
    return builder({
      account,
      accountAddress: resolvedAddress,
      routerAddress: normalized.routerAddress ?? routerContract?.address,
      routerAbi: routerContract?.abi,
      gasTokenAddress: normalized.gasTokenAddress,
      amount: normalized.amount,
      withdrawAll: normalized.withdrawAll,
      protocolName: normalized.lendingProtocol,
      contextValues: normalized.contextValues,
      userCalls,
      mode: normalized.mode,
    });
  }

  if (normalized.aggregatorType !== "kapan") {
    return [];
  }

  const routerAddress = normalized.routerAddress ?? routerContract?.address;
  const routerAbi = routerContract?.abi;
  return defaultKapanCallBuilder({
    account,
    accountAddress: resolvedAddress,
    routerAddress,
    routerAbi,
    gasTokenAddress: normalized.gasTokenAddress,
    amount: normalized.amount,
    withdrawAll: normalized.withdrawAll,
    protocolName: normalized.lendingProtocol,
    contextValues: normalized.contextValues,
    userCalls,
    mode: normalized.mode,
  });
}

export function useKapanPaymasterSendTransaction(
  props: UseKapanPaymasterSendTransactionArgs,
): UsePaymasterSendTransactionResult {
  const { account, address } = useAccount();
  const { data: routerContract } = useDeployedContractInfo("RouterGateway");

  const { tokenAddressMap, resolveGasTokenAddress, options: extendedOptions, ...restProps } = props;

  const { options, kapanMode } = useMemo(() => {
    return normalizeExtendedPaymasterDetails(extendedOptions, tokenAddressMap, resolveGasTokenAddress);
  }, [extendedOptions, tokenAddressMap, resolveGasTokenAddress]);

  const { sendAsync: baseSendAsync, ...baseResult } = usePaymasterSendTransaction({
    ...restProps,
    options,
  });

  const buildFullCalls = useCallback(
    async (override?: Call | Call[]): Promise<Call[]> => {
      const baseCalls = normalizeCallInput(override ?? restProps.calls);
      if (baseCalls.length === 0) {
        throw new Error("calls are required");
      }
      const extraCalls = kapanMode
        ? await buildKapanModeCalls(kapanMode, account as AccountInterface | undefined, address, routerContract, baseCalls)
        : [];
      return [...baseCalls, ...extraCalls];
    },
    [account, address, restProps.calls, routerContract, kapanMode],
  );

  const sendAsync = useCallback(
    async (override?: Call | Call[]) => {
      const finalCalls = await buildFullCalls(override);
      return baseSendAsync(finalCalls);
    },
    [baseSendAsync, buildFullCalls],
  );

  const send = useCallback(
    (override?: Call | Call[]) => {
      void sendAsync(override);
    },
    [sendAsync],
  );

  return {
    ...baseResult,
    send,
    sendAsync,
  };
}

export default useKapanPaymasterSendTransaction;

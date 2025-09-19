import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Call } from "starknet";
import { num } from "starknet";
import {
  DEFAULT_GAS_TOKEN_MAP,
  normalizeExtendedPaymasterDetails,
  parseAuthorizationResult,
  useKapanPaymasterSendTransaction,
  type ExtendedPaymasterDetails,
} from "../hooks/useKapanPaymasterSendTransaction";

let capturedArgs: any = null;
const sendAsyncSpy = vi.fn();
const usePaymasterSendTransactionMock = vi.fn((args: any) => ({
  send: vi.fn(),
  sendAsync: sendAsyncSpy,
  data: null,
  error: null,
  status: "idle",
}));

vi.mock("@starknet-react/core", () => ({
  usePaymasterSendTransaction: (args: any) => {
    capturedArgs = args;
    return usePaymasterSendTransactionMock(args);
  },
}));

vi.mock("~~/hooks/useAccount", () => ({
  useAccount: () => ({
    account: { address: "0xabc" },
    address: "0xabc",
  }),
}));

vi.mock("~~/hooks/scaffold-stark", () => ({
  useDeployedContractInfo: () => ({
    data: { address: "0xrouter", abi: [] as any },
  }),
}));

describe("useKapanPaymasterSendTransaction helpers", () => {
  beforeEach(() => {
    capturedArgs = null;
    sendAsyncSpy.mockReset();
    sendAsyncSpy.mockResolvedValue({ transaction_hash: "0x0" });
    usePaymasterSendTransactionMock.mockClear();
  });

  it("merges default token map", () => {
    expect(DEFAULT_GAS_TOKEN_MAP.strk).toBeDefined();
    expect(DEFAULT_GAS_TOKEN_MAP.eth).toBeDefined();
  });

  it("normalizes default fee mode without modifications", () => {
    const details: ExtendedPaymasterDetails = {
      feeMode: { mode: "default", gasToken: "0x123" },
    };
    const { options, kapanMode } = normalizeExtendedPaymasterDetails(details, undefined, undefined);
    expect(options).toEqual(details);
    expect(kapanMode).toBeNull();
  });

  it("normalizes collateral mode with alias resolution", () => {
    const details: ExtendedPaymasterDetails = {
      feeMode: {
        mode: "collateral",
        protocol: "kapan",
        lendingProtocol: "Vesu",
        gasToken: "USDC",
        amount: 500n,
        withdrawAll: true,
      },
    };
    const { options, kapanMode } = normalizeExtendedPaymasterDetails(details, { usdc: "0xusdc" }, undefined);
    expect(options.feeMode).toEqual({ mode: "default", gasToken: "0xusdc" });
    expect(kapanMode).not.toBeNull();
    expect(kapanMode?.gasTokenAddress).toBe("0xusdc");
    expect(kapanMode?.withdrawAll).toBe(true);
    expect(kapanMode?.amount).toBe(500n);
    expect(kapanMode?.aggregatorType).toBe("kapan");
  });

  it("parses authorization results into calls", () => {
    const entryFelt = BigInt("0x7769746864726177"); // "withdraw"
    const calls = parseAuthorizationResult([[1n, entryFelt, [2n, 3n]]]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      contractAddress: num.toHexString(1n),
      entrypoint: "withdraw",
      calldata: [num.toHexString(2n), num.toHexString(3n)],
    });
  });
});

describe("useKapanPaymasterSendTransaction hook", () => {
  beforeEach(() => {
    capturedArgs = null;
    sendAsyncSpy.mockReset();
    sendAsyncSpy.mockResolvedValue({ transaction_hash: "0xfeed" });
    usePaymasterSendTransactionMock.mockClear();
  });

  it("appends custom builder calls and normalizes fee mode", async () => {
    const builderCalls: Call[] = [
      { contractAddress: "0xrouter", entrypoint: "withdraw", calldata: ["0x1"] },
    ];
    const builderSpy = vi.fn().mockResolvedValue(builderCalls);
    const baseCalls: Call[] = [
      { contractAddress: "0xbase", entrypoint: "do", calldata: [] },
    ];

    const { result } = renderHook(() =>
      useKapanPaymasterSendTransaction({
        calls: baseCalls,
        options: {
          feeMode: {
            mode: "collateral",
            protocol: "kapan",
            lendingProtocol: "Vesu",
            gasToken: "USDC",
            amount: 1000n,
            buildAdditionalCalls: builderSpy,
          },
        },
        tokenAddressMap: { usdc: "0xUSDC" },
      }),
    );

    await act(async () => {
      await result.current.sendAsync();
    });

    expect(builderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        accountAddress: "0xabc",
        gasTokenAddress: "0xUSDC",
        mode: "collateral",
        protocolName: "Vesu",
      }),
    );
    expect(sendAsyncSpy).toHaveBeenCalledWith([...baseCalls, ...builderCalls]);
    expect(capturedArgs?.options?.feeMode).toEqual({ mode: "default", gasToken: "0xUSDC" });
  });

  it("behaves like base hook for default mode", async () => {
    const baseCalls: Call[] = [
      { contractAddress: "0xbase", entrypoint: "operate", calldata: [] },
    ];

    const { result } = renderHook(() =>
      useKapanPaymasterSendTransaction({
        calls: baseCalls,
        options: { feeMode: { mode: "default", gasToken: "0x123" } },
      }),
    );

    await act(async () => {
      await result.current.sendAsync();
    });

    expect(sendAsyncSpy).toHaveBeenCalledWith(baseCalls);
    expect(capturedArgs?.options?.feeMode).toEqual({ mode: "default", gasToken: "0x123" });
  });
});

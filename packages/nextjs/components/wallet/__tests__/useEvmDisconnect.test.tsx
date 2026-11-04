import type { PropsWithChildren } from "react";
import { type EvmWalletSession, EvmWalletSessionContext } from "../EvmWalletSession";
import { useEvmDisconnect } from "../useEvmDisconnect";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ disconnectAsync: vi.fn(), toastError: vi.fn() }));
vi.mock("wagmi", () => ({ useDisconnect: () => ({ disconnectAsync: mocks.disconnectAsync }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));

const withSession = (session: EvmWalletSession) =>
  function SessionWrapper({ children }: PropsWithChildren) {
    return <EvmWalletSessionContext.Provider value={session}>{children}</EvmWalletSessionContext.Provider>;
  };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.disconnectAsync.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("EVM disconnect lifecycle", () => {
  it("logs out an email session without invoking Wagmi disconnect and stays pending until logout finishes", async () => {
    let finishLogout!: () => void;
    const logout = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finishLogout = resolve;
        }),
    );
    const { result } = renderHook(useEvmDisconnect, {
      wrapper: withSession({ kind: "email", ready: true, logout }),
    });

    let operation!: Promise<void>;
    act(() => {
      operation = result.current.disconnect();
    });
    expect(result.current.pending).toBe(true);
    expect(logout).toHaveBeenCalledOnce();
    expect(mocks.disconnectAsync).not.toHaveBeenCalled();

    await act(async () => {
      finishLogout();
      await operation;
    });
    expect(result.current.pending).toBe(false);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("disconnects an external wallet without logging out Privy", async () => {
    const logout = vi.fn();
    const { result } = renderHook(useEvmDisconnect, {
      wrapper: withSession({ kind: "external", ready: true, logout }),
    });

    await act(async () => {
      await result.current.disconnect();
    });
    expect(mocks.disconnectAsync).toHaveBeenCalledOnce();
    expect(logout).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(false);
  });

  it("reports an email logout failure, clears pending, and does not silently disconnect another wallet", async () => {
    const logout = vi.fn().mockRejectedValue(new Error("session unavailable"));
    const { result } = renderHook(useEvmDisconnect, {
      wrapper: withSession({ kind: "email", ready: true, logout }),
    });

    await act(async () => {
      await result.current.disconnect();
    });
    expect(mocks.toastError).toHaveBeenCalledWith("Could not disconnect. Please try again.");
    expect(mocks.disconnectAsync).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(false);
  });
});

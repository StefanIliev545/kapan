import { renderHook, waitFor } from "@testing-library/react";
import { useAutoConnect } from "../useAutoConnect";
import { useConnect } from "@starknet-react/core";
import { useReadLocalStorage } from "usehooks-ts";
import scaffoldConfig from "~~/scaffold.config";
import { burnerAccounts } from "@scaffold-stark/stark-burner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccount } from "~~/hooks/useAccount";

type Mock = ReturnType<typeof vi.fn>;

// Mock the dependencies
vi.mock("usehooks-ts", () => ({
  useReadLocalStorage: vi.fn(),
}));

vi.mock("@starknet-react/core", () => ({
  useConnect: vi.fn(),
}));

vi.mock("~~/scaffold.config", () => ({
  default: {
    walletAutoConnect: true,
    autoConnectTTL: 60000,
  },
}));

vi.mock("@scaffold-stark/stark-burner", () => ({
  burnerAccounts: [{ address: "0x123" }, { address: "0x456" }],
  BurnerConnector: vi.fn(),
}));

vi.mock("~~/hooks/useAccount", () => ({
  useAccount: vi.fn(() => ({
    status: "disconnected",
  })),
}));

describe("useAutoConnect", () => {
  let mockConnect: ReturnType<typeof vi.fn>;
  let mockConnectors: any[];
  const mockedUseAccount = useAccount as unknown as Mock;

  beforeEach(() => {
    mockConnect = vi.fn();
    mockConnectors = [
      { id: "wallet-1" },
      { id: "burner-wallet", burnerAccount: null },
    ];
    (useConnect as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      connect: mockConnect,
      connectors: mockConnectors,
    }));
    vi.spyOn(scaffoldConfig, "walletAutoConnect", "get").mockReturnValue(true);
    mockedUseAccount.mockReturnValue({ status: "disconnected" } as any);
    vi.mocked(useReadLocalStorage).mockReturnValue(Date.now());
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("should auto-connect if walletAutoConnect is enabled and a saved connector exists", () => {
    window.localStorage.setItem("lastUsedConnector", JSON.stringify({ id: "wallet-1" }));

    renderHook(() => useAutoConnect());

    return waitFor(() => {
      expect(mockConnect).toHaveBeenCalledWith({
        connector: expect.objectContaining({ id: "wallet-1" }),
      });
    });
  });

  it("should not auto-connect if walletAutoConnect is disabled", () => {
    vi.spyOn(scaffoldConfig, "walletAutoConnect", "get").mockReturnValue(
      false as true,
    );
    window.localStorage.setItem("lastUsedConnector", JSON.stringify({ id: "wallet-1" }));

    renderHook(() => useAutoConnect());

    return waitFor(() => {
      expect(mockConnect).not.toHaveBeenCalled();
    });
  });

  it("should auto-connect to the burner wallet and set burnerAccount if savedConnector exists", () => {
    window.localStorage.setItem(
      "lastUsedConnector",
      JSON.stringify({
        id: "burner-wallet",
        ix: 1,
      }),
    );
    mockConnectors = [
      { id: "wallet-1" },
      {
        id: "burner-wallet",
        burnerAccount: burnerAccounts[1],
      },
    ];
    (useConnect as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      connect: mockConnect,
      connectors: mockConnectors,
    }));

    renderHook(() => useAutoConnect());

    return waitFor(() => {
      expect(mockConnect).toHaveBeenCalledWith({
        connector: expect.objectContaining({
          id: "burner-wallet",
          burnerAccount: burnerAccounts[1],
        }),
      });
    });
  });

  it("should not connect if there is no saved connector", () => {
    window.localStorage.removeItem("lastUsedConnector");

    renderHook(() => useAutoConnect());

    return waitFor(() => {
      expect(mockConnect).not.toHaveBeenCalled();
    });
  });

  it("should not connect if saved connector is not found in the connectors list", () => {
    window.localStorage.setItem(
      "lastUsedConnector",
      JSON.stringify({
        id: "non-existent-connector",
      }),
    );

    renderHook(() => useAutoConnect());

    return waitFor(() => {
      expect(mockConnect).not.toHaveBeenCalled();
    });
  });

  it("should not auto-connect if the last connection time exceeds the TTL", () => {
    window.localStorage.setItem("lastUsedConnector", JSON.stringify({ id: "wallet-1" }));
    const now = Date.now();
    vi.mocked(useReadLocalStorage).mockReturnValue(now - scaffoldConfig.autoConnectTTL - 1);

    renderHook(() => useAutoConnect());

    return waitFor(() => {
      expect(mockConnect).not.toHaveBeenCalled();
    });
  });

});

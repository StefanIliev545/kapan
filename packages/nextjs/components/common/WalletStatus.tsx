"use client";

import { useMemo } from "react";
import { useWalletConnection } from "~~/hooks/useWalletConnection";
import { truncateAddress } from "~~/utils/address";

export type NetworkType = "evm" | "starknet";

export interface WalletStatusProps {
  /**
   * The network type to check connection status for
   */
  networkType: NetworkType;
  /**
   * Content to render when wallet is connected
   */
  children: React.ReactNode;
  /**
   * Optional content to render when wallet is disconnected
   * If not provided, shows a default "Connect wallet" message
   */
  disconnectedContent?: React.ReactNode;
  /**
   * Optional class name for the wrapper
   */
  className?: string;
}

/**
 * Conditional rendering component based on wallet connection status.
 *
 * Shows different content depending on whether the user's wallet is connected
 * for the specified network type (EVM or Starknet).
 */
export const WalletStatus = ({
  networkType,
  children,
  disconnectedContent,
  className = "",
}: WalletStatusProps) => {
  const { evm, starknet } = useWalletConnection();

  const isConnected = useMemo(() => {
    return networkType === "evm" ? evm.isConnected : starknet.isConnected;
  }, [networkType, evm.isConnected, starknet.isConnected]);

  if (!isConnected) {
    return (
      <div className={className}>
        {disconnectedContent ?? (
          <span className="text-base-content/50">
            Connect {networkType === "starknet" ? "Starknet" : ""} wallet
          </span>
        )}
      </div>
    );
  }

  return <div className={className}>{children}</div>;
};

export interface WalletAddressProps {
  /**
   * The network type to get address for
   */
  networkType: NetworkType;
  /**
   * Format for displaying the address
   * - "short": Show first 6 and last 4 characters (default)
   * - "full": Show full address
   */
  format?: "short" | "full";
  /**
   * Optional class name for the address text
   */
  className?: string;
}

/**
 * Displays the connected wallet address for the specified network.
 * Returns null if no wallet is connected.
 */
export const WalletAddress = ({
  networkType,
  format = "short",
  className = "",
}: WalletAddressProps) => {
  const { evm, starknet } = useWalletConnection();

  const address = useMemo(() => {
    return networkType === "evm" ? evm.address : starknet.address;
  }, [networkType, evm.address, starknet.address]);

  if (!address) return null;

  const displayAddress =
    format === "full"
      ? address
      : truncateAddress(address);

  return <span className={className}>{displayAddress}</span>;
};

export interface UseWalletStatusOptions {
  networkType: NetworkType;
}

/**
 * Hook to get wallet connection status and address for a specific network.
 * Useful when you need programmatic access to wallet status.
 */
export const useWalletStatus = ({ networkType }: UseWalletStatusOptions) => {
  const { evm, starknet } = useWalletConnection();

  return useMemo(() => {
    const wallet = networkType === "evm" ? evm : starknet;
    return {
      isConnected: wallet.isConnected,
      address: wallet.address,
      status: wallet.status,
    };
  }, [networkType, evm, starknet]);
};

/**
 * Helper function to generate tooltip messages for wallet-required actions.
 * Returns appropriate message based on connection status and action state.
 */
export const getWalletActionMessage = ({
  isWalletConnected,
  actionVerb,
  disabledMessage,
  isDisabled,
}: {
  isWalletConnected: boolean;
  actionVerb: string;
  disabledMessage?: string;
  isDisabled?: boolean;
}): string => {
  if (!isWalletConnected) {
    return `Connect wallet to ${actionVerb}`;
  }
  if (isDisabled && disabledMessage) {
    return disabledMessage;
  }
  return actionVerb.charAt(0).toUpperCase() + actionVerb.slice(1);
};

export default WalletStatus;

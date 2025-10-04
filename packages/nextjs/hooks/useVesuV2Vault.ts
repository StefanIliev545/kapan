import { useReadContract } from "@starknet-react/core";
import { useMemo } from "react";

// PoolFactory contract address (same for mainnet and sepolia)
const POOL_FACTORY_ADDRESS = "0x3760f903a37948f97302736f89ce30290e45f441559325026842b7a6fb388c0";

// PoolFactory ABI - just the function we need
const POOL_FACTORY_ABI = [
  {
    "name": "v_token_for_asset",
    "type": "function",
    "inputs": [
      { "name": "pool", "type": "felt" },
      { "name": "asset", "type": "felt" }
    ],
    "outputs": [
      { "name": "v_token", "type": "felt" }
    ],
    "state_mutability": "view"
  }
] as const;

/**
 * Hook to get the vToken (ERC4626 vault) address for a given asset and pool in VesuV2
 * Uses PoolFactory.v_token_for_asset directly with manual contract setup
 */
export const useVesuV2Vault = (assetAddress: string, poolAddress: string) => {
  const { data: rawVtokenAddress, isLoading, error } = useReadContract({
    abi: POOL_FACTORY_ABI,
    address: POOL_FACTORY_ADDRESS,
    functionName: "v_token_for_asset",
    args: [poolAddress, assetAddress],
  });
  
  // Deserialize the ContractAddress (felt) to a hex string
  const vtokenAddress = useMemo(() => {
    if (!rawVtokenAddress) return undefined;
    
    // Handle different response formats
    let addressBigInt: bigint;
    
    if (typeof rawVtokenAddress === 'bigint') {
      addressBigInt = rawVtokenAddress;
    } else if (typeof rawVtokenAddress === 'string') {
      addressBigInt = BigInt(rawVtokenAddress);
    } else if (typeof rawVtokenAddress === 'number') {
      addressBigInt = BigInt(rawVtokenAddress);
    } else if (typeof rawVtokenAddress === 'object' && rawVtokenAddress !== null) {
      // Handle different object response formats
      if (Array.isArray(rawVtokenAddress) && rawVtokenAddress.length > 0) {
        addressBigInt = BigInt(rawVtokenAddress[0]);
      } else if ('v_token' in rawVtokenAddress) {
        // PoolFactory returns {v_token: bigint}
        addressBigInt = BigInt((rawVtokenAddress as any).v_token);
      } else if ('address' in rawVtokenAddress) {
        addressBigInt = BigInt((rawVtokenAddress as any).address);
      } else {
        // Try to convert the object itself
        console.log("Unexpected vtokenAddress format:", rawVtokenAddress);
        return undefined;
      }
    } else {
      console.log("Unknown vtokenAddress type:", typeof rawVtokenAddress, rawVtokenAddress);
      return undefined;
    }
    
    return `0x${addressBigInt.toString(16).padStart(64, "0")}`;
  }, [rawVtokenAddress]);
  
  return {
    vtokenAddress,
    isLoading,
    error,
  };
};

/**
 * Hook to get the user's vToken balance (shares)
 * Uses ERC20 balanceOf to read the share balance
 */
export const useVesuV2VaultBalance = (
  vtokenAddress: string | undefined, 
  userAddress: string | undefined,
  enabled = true
) => {
  // ERC20 ABI - just balanceOf function
  const ERC20_ABI = [
    {
      "name": "balance_of",
      "type": "function",
      "inputs": [
        { "name": "account", "type": "felt" }
      ],
      "outputs": [
        { "name": "balance", "type": "core::integer::u256" }
      ],
      "state_mutability": "view"
    }
  ] as const;

  const { data: rawBalance, isLoading, error } = useReadContract({
    abi: ERC20_ABI,
    address: vtokenAddress as `0x${string}`,
    functionName: "balance_of",
    args: userAddress ? [userAddress] : undefined,
    enabled: enabled && !!vtokenAddress && !!userAddress,
  });

 // console.log("rawBalance", userAddress, vtokenAddress, rawBalance, enabled);
  // Deserialize the u256 balance
  const balance = useMemo(() => {
    if (!rawBalance) return undefined;
    
    // Handle u256 response (low, high)
    if (typeof rawBalance === 'object' && rawBalance !== null && 'low' in rawBalance && 'high' in rawBalance) {
      return BigInt(rawBalance.low) + (BigInt(rawBalance.high) << 128n);
    } else if (typeof rawBalance === 'object' && rawBalance !== null && 'balance' in rawBalance) {
      // Some providers wrap named output: { balance: <u256|bigint> }
      const inner = (rawBalance as any).balance;
      if (inner && typeof inner === 'object' && 'low' in inner && 'high' in inner) {
        return BigInt(inner.low) + (BigInt(inner.high) << 128n);
      }
      return BigInt(inner);
    } else if (typeof rawBalance === 'bigint') {
      return rawBalance;
    } else if (typeof rawBalance === 'string' || typeof rawBalance === 'number') {
      return BigInt(rawBalance);
    }
    
    return undefined;
  }, [rawBalance]);

  return {
    balance,
    isLoading,
    error,
  };
};

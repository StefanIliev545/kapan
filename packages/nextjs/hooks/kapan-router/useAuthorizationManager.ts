/**
 * Hook for managing authorization and deauthorization of protocol instructions
 *
 * Handles:
 * - getAuthorizations: Get authorization calls needed before executing instructions
 * - getDeauthorizations: Get deauthorization calls to revoke permissions after execution
 */
import { useCallback } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { type Address } from "viem";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth/useDeployedContractInfo";
import { normalizeProtocolName, type ProtocolInstruction } from "~~/utils/v2/instructionHelpers";
import { logger } from "~~/utils/logger";
import {
  type AuthorizationCall,
  type UseKapanRouterV2Options,
  DEAUTH_ABI,
} from "./types";

/**
 * Hook for managing authorization/deauthorization of protocol instructions
 */
export const useAuthorizationManager = (options?: UseKapanRouterV2Options) => {
  const { address: userAddress } = useAccount();
  const { data: routerContract } = useDeployedContractInfo({ contractName: "KapanRouter" });
  const publicClient = usePublicClient({ chainId: options?.chainId });

  /**
   * Get authorization calls needed before executing instructions
   */
  const getAuthorizations = useCallback(async (
    instructions: ProtocolInstruction[]
  ): Promise<AuthorizationCall[]> => {
    if (!routerContract || !userAddress || !publicClient) {
      logger.warn("[getAuthorizations] Missing context", { routerContract: !!routerContract, userAddress, publicClient: !!publicClient });
      return [];
    }

    try {
      const protocolInstructions = instructions.map(inst => ({
        protocolName: normalizeProtocolName(inst.protocolName),
        data: inst.data as `0x${string}`,
      }));

      logger.info("[getAuthorizations] Calling authorizeInstructions with", protocolInstructions.length, "instructions");
      logger.debug("[getAuthorizations] Instructions:", protocolInstructions.map(p => p.protocolName));

      // We send the FULL set of instructions to authorizeInstructions.
      // The Router calculates the simulated state (UTXOs) internally.
      // Use blockTag: 'pending' to avoid RPC caching issues that can cause stale allowance reads
      const result = await publicClient.readContract({
        address: routerContract.address as Address,
        abi: routerContract.abi,
        functionName: "authorizeInstructions",
        args: [protocolInstructions, userAddress as Address],
        blockTag: 'pending',
      });
      const [targets, data] = result as unknown as [Address[], `0x${string}`[]];

      logger.info("[getAuthorizations] Raw result:", {
        targetsCount: targets.length,
        targets: targets.map((t, i) => ({ index: i, target: t, hasData: data[i]?.length > 2 }))
      });

      const authCalls: AuthorizationCall[] = [];
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const dataItem = data[i];
        const isValid = target && target !== "0x0000000000000000000000000000000000000000" && dataItem && dataItem.length > 0;
        logger.debug(`[getAuthorizations] Index ${i}: target=${target}, dataLen=${dataItem?.length}, isValid=${isValid}`);
        if (isValid) {
          authCalls.push({
            target: target,
            data: dataItem,
          });
        }
      }

      logger.info("[getAuthorizations] Filtered auth calls:", authCalls.length);
      return authCalls;
    } catch (error) {
      console.error("Error calling authorizeInstructions:", error);
      logger.error("[getAuthorizations] Error:", error);
      return [];
    }
  }, [routerContract, userAddress, publicClient]);

  /**
   * Get deauthorization calls to revoke permissions after execution
   */
  const getDeauthorizations = useCallback(async (
    instructions: ProtocolInstruction[]
  ): Promise<AuthorizationCall[]> => {
    if (!routerContract || !userAddress || !publicClient) {
      return [];
    }

    try {
      const protocolInstructions = instructions.map(inst => ({
        protocolName: normalizeProtocolName(inst.protocolName),
        data: inst.data as `0x${string}`,
      }));

      // Use blockTag: 'pending' to avoid RPC caching issues
      const result = await publicClient.readContract({
        address: routerContract.address as Address,
        abi: DEAUTH_ABI,
        functionName: "deauthorizeInstructions",
        args: [protocolInstructions, userAddress as Address],
        blockTag: 'pending',
      });
      const [targets, data] = result as unknown as [Address[], `0x${string}`[]];

      const authCalls: AuthorizationCall[] = [];
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const dataItem = data[i];
        if (target && target !== "0x0000000000000000000000000000000000000000" && dataItem && dataItem.length > 0) {
          authCalls.push({ target, data: dataItem });
        }
      }
      return authCalls;
    } catch (error) {
      console.error("Error calling deauthorizeInstructions:", error);
      return [];
    }
  }, [routerContract, userAddress, publicClient]);

  return {
    getAuthorizations,
    getDeauthorizations,
    routerContract,
  };
};

import { useEffect } from "react";
import { useAccount, useSwitchChain } from "wagmi";

/**
 * Hook to automatically switch to the correct EVM network when a modal or component is active.
 *
 * @param isActive - Whether the component/modal is active (e.g., modal is open)
 * @param targetChainId - The target chain ID to switch to
 *
 * @example
 * ```tsx
 * const MyModal: FC<{ isOpen: boolean; chainId?: number }> = ({ isOpen, chainId }) => {
 *   useNetworkSwitch(isOpen, chainId);
 *   // ... rest of component
 * };
 * ```
 */
export function useNetworkSwitch(isActive: boolean, targetChainId?: number): void {
  const { chain } = useAccount();
  const { switchChain } = useSwitchChain();

  useEffect(() => {
    if (!isActive || !targetChainId) return;
    if (chain?.id !== targetChainId) {
      try {
        switchChain?.({ chainId: targetChainId });
      } catch (e) {
        console.warn("Auto network switch failed", e);
      }
    }
  }, [isActive, targetChainId, chain?.id, switchChain]);
}

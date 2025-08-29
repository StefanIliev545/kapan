import { useEffect } from "react";
import { useTargetNetwork } from "./useTargetNetwork";
import { useQueryClient } from "@tanstack/react-query";
import { UseBalanceParameters, useBalance } from "wagmi";
import { useBlockNumberContext } from "~~/hooks/scaffold-eth";

/**
 * Wrapper around wagmi's useBalance hook. Updates data on every block change when watch is true.
 */
export const useWatchBalance = (
  useBalanceParameters: UseBalanceParameters,
  watch = false,
) => {
  const { targetNetwork } = useTargetNetwork();
  const queryClient = useQueryClient();
  const blockNumber = useBlockNumberContext();
  const { queryKey, ...restUseBalanceReturn } = useBalance(useBalanceParameters);

  useEffect(() => {
    if (watch && blockNumber !== undefined) {
      queryClient.invalidateQueries({ queryKey });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNumber, watch]);

  return restUseBalanceReturn;
};

import { useEffect } from "react";
import { UseBalanceParameters, useBalance } from "wagmi";
import { useBlockNumberContext } from "~~/hooks/scaffold-eth";

/**
 * Wrapper around wagmi's useBalance hook. Updates data on every block change when watch is true.
 */
export const useWatchBalance = (
  useBalanceParameters: UseBalanceParameters,
  watch = false,
) => {
  const blockNumber = useBlockNumberContext();
  const { refetch, ...restUseBalanceReturn } = useBalance(useBalanceParameters);

  useEffect(() => {
    if (watch && blockNumber !== undefined) {
      refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNumber, watch]);

  return restUseBalanceReturn;
};

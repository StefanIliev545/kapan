import { Address } from "@starknet-react/chains";
import { useScaffoldTokenBalance } from "./useScaffoldTokenBalance";

type UseScaffoldStrkBalanceProps = {
  address?: Address | string;
};

/**
 * Hook to fetch STRK balance on Starknet.
 * Uses the base useScaffoldTokenBalance hook.
 */
const useScaffoldStrkBalance = ({ address }: UseScaffoldStrkBalanceProps) => {
  return useScaffoldTokenBalance({
    address,
    tokenContractName: "Strk",
    symbol: "STRK",
    decimals: 18,
  });
};

export default useScaffoldStrkBalance;

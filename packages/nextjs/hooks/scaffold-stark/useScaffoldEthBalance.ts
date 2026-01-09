import { Address } from "@starknet-react/chains";
import { useScaffoldTokenBalance } from "./useScaffoldTokenBalance";

type UseScaffoldEthBalanceProps = {
  address?: Address | string;
};

/**
 * Hook to fetch ETH balance on Starknet.
 * Uses the base useScaffoldTokenBalance hook.
 */
const useScaffoldEthBalance = ({ address }: UseScaffoldEthBalanceProps) => {
  return useScaffoldTokenBalance({
    address,
    tokenContractName: "Eth",
    symbol: "ETH",
    decimals: 18,
  });
};

export default useScaffoldEthBalance;

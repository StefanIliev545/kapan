import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { usePublicClient } from "wagmi";

export const useGasEstimate = (network: "evm" | "stark", gasUnits: bigint = 200000n) => {
  const publicClient = usePublicClient();
  const [usd, setUsd] = useState(0);

  useEffect(() => {
    const fetchGas = async () => {
      if (network !== "evm") {
        setUsd(0);
        return;
      }
      try {
        const [gasPrice, priceData] = await Promise.all([
          publicClient.getGasPrice(),
          fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd")
            .then(r => r.json())
            .then(d => d.ethereum.usd),
        ]);
        const costEth = Number(formatEther(gasPrice * gasUnits));
        setUsd(costEth * priceData);
      } catch (e) {
        console.error(e);
      }
    };
    fetchGas();
  }, [publicClient, network, gasUnits]);

  return usd;
};

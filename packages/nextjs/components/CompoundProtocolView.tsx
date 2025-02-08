import { FC, useEffect, useState, useRef } from "react";
import { ProtocolView, ProtocolPosition } from "./ProtocolView";
import { useAccount, useWalletClient } from "wagmi";
import { useScaffoldContract, externalContracts } from "~~/hooks/scaffold-eth";
import { formatUnits } from "viem";

export const CompoundProtocolView: FC = () => {
  const [suppliedPositions, setSuppliedPositions] = useState<ProtocolPosition[]>([]);
  const [borrowedPositions, setBorrowedPositions] = useState<ProtocolPosition[]>([]);
  const [currentLtv, setCurrentLtv] = useState<number>(0);

  const { address: connectedAddress } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { data: compoundGateway } = useScaffoldContract({
    contractName: "CompoundGateway",
    walletClient,
  });

  const { data: usdc } = useScaffoldContract({
    contractName: "USDC",
    walletClient,
  });

  const { data: usdt } = useScaffoldContract({
    contractName: "USDT",
    walletClient,
  });

  const { data: usdcE } = useScaffoldContract({
    contractName: "USDCe",
    walletClient,
  });

  const { data: eth } = useScaffoldContract({
    contractName: "eth",
    walletClient,
  });

  // Use a ref to hold the contract instance so that it does not cause re-renders
  const contractRef = useRef(compoundGateway);
  // When compoundGateway is available (or updated), store it in our ref.
  useEffect(() => {
    if (compoundGateway) {
      contractRef.current = compoundGateway;
    }
  }, [compoundGateway]);

  useEffect(() => {
    // Run only if we have a contract and a connected address.
    if (!contractRef.current || !contractRef.current.read || !connectedAddress) return;

    const tokens: Record<string, string> = {
      WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      "USDC.e": "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
    };

    const fetchCompoundData = async () => {
      try {
        const newSuppliedPositions: ProtocolPosition[] = [];
        const newBorrowedPositions: ProtocolPosition[] = [];

        // Function to convert the raw rate into an APY value.
        const convertRateToAPY = (rate: bigint) => Number(rate) / 1e25;

        // For each token, fetch the supply rate, borrow rate, balance, and borrow balance.
        await Promise.all(
          Object.entries(tokens).map(async ([tokenName, tokenAddress]) => {
            const [supplyRate, borrowRate, balanceRaw, borrowBalanceRaw] = await Promise.all([
              contractRef.current?.read.getSupplyRate([tokenAddress]),
              contractRef.current?.read.getBorrowRate([tokenAddress]),
              contractRef.current?.read.getBalance([tokenAddress, connectedAddress]),
              contractRef.current?.read.getBorrowBalance([tokenAddress, connectedAddress]),
            ]);

            const balance = Number(formatUnits(balanceRaw ?? BigInt(0), 6));
            const borrowBalance = Number(formatUnits(borrowBalanceRaw ?? BigInt(0), 6));

            console.log(`${tokenName}:`, {
              address: tokenAddress,
              supplyRate: supplyRate?.toString(),
              borrowRate: borrowRate?.toString(),
              balance,
              borrowBalance,
            });

            if (borrowBalance > 0) {
              newBorrowedPositions.push({
                icon: "/logos/ethereum-logo.svg",
                name: tokenName,
                balance: -borrowBalance, // Use a negative value to indicate a borrow.
                currentRate: convertRateToAPY(borrowRate ?? BigInt(0)),
                optimalRate: convertRateToAPY(borrowRate ?? BigInt(25)),
              });
            } else if (balance > 0) {
              newSuppliedPositions.push({
                icon: "/logos/ethereum-logo.svg",
                name: tokenName,
                balance,
                currentRate: convertRateToAPY(supplyRate ?? BigInt(25)),
                optimalRate: convertRateToAPY(supplyRate ?? BigInt(25)),
              });
            }
          }),
        );

        // Update state only once with the final data.
        setSuppliedPositions(newSuppliedPositions);
        setBorrowedPositions(newBorrowedPositions);
        // For now, we hardcode the LTV; in a real-world case, this might come from the contract.
        setCurrentLtv(75);
      } catch (error) {
        console.error("Error fetching Compound data:", error);
      }
    };

    fetchCompoundData();
  }, [connectedAddress]); // Only re-run this effect if the connected address changes

  return (
    <ProtocolView
      protocolName="Compound V3"
      protocolIcon="/logos/compound.svg"
      ltv={currentLtv}
      maxLtv={90} // Ideally, this comes from the contract as well.
      suppliedPositions={suppliedPositions}
      borrowedPositions={borrowedPositions}
    />
  );
};

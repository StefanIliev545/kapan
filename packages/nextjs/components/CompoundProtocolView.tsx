import { FC, useEffect, useState, useRef, useMemo } from "react";
import { ProtocolView, ProtocolPosition } from "./ProtocolView";
import { useAccount, useWalletClient } from "wagmi";
import { useScaffoldContract } from "~~/hooks/scaffold-eth";
import { formatUnits } from "viem";

export const CompoundProtocolView: FC = () => {
  // State to hold positions and LTV.
  const [suppliedPositions, setSuppliedPositions] = useState<ProtocolPosition[]>([]);
  const [borrowedPositions, setBorrowedPositions] = useState<ProtocolPosition[]>([]);
  const [currentLtv, setCurrentLtv] = useState<number>(0);
  
  const { address: connectedAddress } = useAccount();
  const { data: walletClient } = useWalletClient();

  // Load the CompoundGateway contract.
  const { data: compoundGateway } = useScaffoldContract({
    contractName: "CompoundGateway",
    walletClient,
  });

  // Load the ERC‑20 token contracts.
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
  const { data: weth } = useScaffoldContract({
    contractName: "WETH",
    walletClient,
  });

  // Pin the CompoundGateway contract so that its reference remains stable.
  const compoundGatewayRef = useRef(compoundGateway);
  useEffect(() => {
    if (compoundGateway) {
      compoundGatewayRef.current = compoundGateway;
    }
  }, [compoundGateway]);

  // Pin each token contract in its own ref.
  const usdcRef = useRef(usdc);
  useEffect(() => {
    if (usdc) usdcRef.current = usdc;
  }, [usdc]);

  const usdtRef = useRef(usdt);
  useEffect(() => {
    if (usdt) usdtRef.current = usdt;
  }, [usdt]);

  const usdcERef = useRef(usdcE);
  useEffect(() => {
    if (usdcE) usdcERef.current = usdcE;
  }, [usdcE]);

  const wethRef = useRef(weth);
  useEffect(() => {
    if (weth) wethRef.current = weth;
  }, [weth]);

  // Build a stable token list from the pinned contracts.
  const tokens = useMemo(() => {
    const list: { name: string; address: string; contract: any }[] = [];
    if (wethRef.current?.address) {
      list.push({ name: "WETH", address: wethRef.current.address, contract: wethRef.current });
    }
    if (usdcRef.current?.address) {
      list.push({ name: "USDC", address: usdcRef.current.address, contract: usdcRef.current });
    }
    if (usdtRef.current?.address) {
      list.push({ name: "USDT", address: usdtRef.current.address, contract: usdtRef.current });
    }
    if (usdcERef.current?.address) {
      list.push({ name: "USDC.e", address: usdcERef.current.address, contract: usdcERef.current });
    }
    return list;
  }, [
    wethRef.current?.address,
    usdcRef.current?.address,
    usdtRef.current?.address,
    usdcERef.current?.address,
  ]);

  // Map token names to logo file paths from the public folder.
  const tokenLogos: Record<string, string> = {
    WETH: "/logos/ethereum.svg",
    USDC: "/logos/usdc.svg",
    USDT: "/logos/usdt.svg", // Make sure you add this logo file.
    "USDC.e": "/logos/usdc.svg", // Using the USDC logo; adjust if needed.
  };

  // Fetch and update positions from the CompoundGateway.
  useEffect(() => {
    if (!connectedAddress || tokens.length === 0 || !compoundGatewayRef.current?.read) return;

    const fetchCompoundData = async () => {
      try {
        const newSuppliedPositions: ProtocolPosition[] = [];
        const newBorrowedPositions: ProtocolPosition[] = [];

        // Helper: convert raw rates to an APY percentage.
        const convertRateToAPY = (rate: bigint) => Number(rate) / 1e25;

        // Process each token concurrently.
        await Promise.all(
          tokens.map(async (token) => {
            // Retrieve the token's decimals (default to 18 if unavailable).
            let decimals = 18;
            try {
              decimals = Number(await token.contract.read.decimals());
            } catch (err) {
              console.warn(`Could not fetch decimals for ${token.name}; defaulting to 18.`);
            }

            const [supplyRate, borrowRate, balanceRaw, borrowBalanceRaw] = await Promise.all([
              compoundGatewayRef.current!.read.getSupplyRate([token.address]),
              compoundGatewayRef.current!.read.getBorrowRate([token.address]),
              compoundGatewayRef.current!.read.getBalance([token.address, connectedAddress]),
              compoundGatewayRef.current!.read.getBorrowBalance([token.address, connectedAddress]),
            ]);

            const balance = Number(formatUnits(balanceRaw ?? BigInt(0), decimals));
            const borrowBalance = Number(formatUnits(borrowBalanceRaw ?? BigInt(0), decimals));

            console.log(`${token.name}:`, {
              tokenAddress: token.address,
              supplyRate: supplyRate?.toString(),
              borrowRate: borrowRate?.toString(),
              balance,
              borrowBalance,
            });

            // Create a position based on the fetched data.
            if (borrowBalance > 0) {
              newBorrowedPositions.push({
                icon: tokenLogos[token.name],
                name: token.name,
                balance: -borrowBalance, // Negative indicates borrowing.
                currentRate: convertRateToAPY(borrowRate ?? BigInt(0)),
                optimalRate: convertRateToAPY(borrowRate ?? BigInt(0)),
              });
            } else if (balance > 0) {
              newSuppliedPositions.push({
                icon: tokenLogos[token.name],
                name: token.name,
                balance,
                currentRate: convertRateToAPY(supplyRate ?? BigInt(0)),
                optimalRate: convertRateToAPY(supplyRate ?? BigInt(0)),
              });
            }
          })
        );

        setSuppliedPositions(newSuppliedPositions);
        setBorrowedPositions(newBorrowedPositions);
        setCurrentLtv(75);
      } catch (error) {
        console.error("Error fetching Compound data:", error);
      }
    };

    fetchCompoundData();
  }, [connectedAddress, tokens]);

  return (
    <ProtocolView
      protocolName="Compound V3"
      protocolIcon="/logos/compound.svg"
      ltv={currentLtv}
      maxLtv={90}
      suppliedPositions={suppliedPositions}
      borrowedPositions={borrowedPositions}
    />
  );
};

export default CompoundProtocolView;

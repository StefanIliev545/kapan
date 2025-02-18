"use client";

import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { AaveProtocolView } from "~~/components/specific/aave/AaveProtocolView";
import { CompoundProtocolView } from "~~/components/specific/compound/CompoundProtocolView";

const Home: NextPage = () => {
  const { chain: ConnectedChain } = useAccount();
  const isSepoliaNetwork = ConnectedChain?.id === 11155111; // Sepolia chain ID

  return (
    <>
      {isSepoliaNetwork && (
        <div className="alert alert-warning mx-5 mt-4 flex items-center gap-2">
          <ExclamationTriangleIcon className="h-5 w-5" />
          <div>
            <span className="font-bold">Note:</span> Moving debt between protocols is not available on Sepolia testnet 
            because lending protocols use different token contract addresses. Please use Arbitrum for full functionality.
          </div>
        </div>
      )}
      <AaveProtocolView />
      <CompoundProtocolView />
    </>
  );
};

export default Home;

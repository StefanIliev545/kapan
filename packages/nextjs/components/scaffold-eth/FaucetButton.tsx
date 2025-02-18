"use client";

import { useState } from "react";
import Image from "next/image";
import { createWalletClient, http, parseEther } from "viem";
import { hardhat, sepolia } from "viem/chains";
import { useAccount } from "wagmi";
import { BanknotesIcon } from "@heroicons/react/24/outline";

/**
 * FaucetButton button which lets you grab eth.
 */
export const FaucetButton = () => {
  const { chain: ConnectedChain } = useAccount();

  // Render only on local chain or sepolia
  if (ConnectedChain?.id !== hardhat.id && ConnectedChain?.id !== sepolia.id) {
    return null;
  }

  // For local network, show original faucet button
  if (ConnectedChain?.id === hardhat.id) {
    return <LocalFaucetButton />;
  }

  // For Sepolia, show dropdown with both options
  return (
    <div className="dropdown dropdown-end">
      <label tabIndex={0} className="btn btn-secondary btn-sm px-2 rounded-full ml-1">
        <BanknotesIcon className="h-4 w-4" />
      </label>
      <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
        <li>
          <a
            href="https://faucet.circle.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2"
          >
            <Image src="/logos/usdc.svg" alt="USDC" width={18} height={18} />
            Get USDC
          </a>
        </li>
        <li>
          <a
            href="https://www.alchemy.com/faucets/ethereum-sepolia"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2"
          >
            <Image src="/logos/eth.svg" alt="ETH" width={16} height={16} />
            Get sepETH
          </a>
        </li>
      </ul>
    </div>
  );
};

// Original local faucet button logic moved to a separate component
const LocalFaucetButton = () => {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);

  const localWalletClient = createWalletClient({
    chain: hardhat,
    transport: http(),
  });

  const sendETH = async () => {
    if (!address) return;
    try {
      setLoading(true);
      await localWalletClient.sendTransaction({
        account: FAUCET_ADDRESS,
        to: address,
        value: parseEther(NUM_OF_ETH),
      });
      setLoading(false);
    } catch (error) {
      console.error("⚡️ ~ file: FaucetButton.tsx:sendETH ~ error", error);
      setLoading(false);
    }
  };

  return (
    <div className="ml-1">
      <button className="btn btn-secondary btn-sm px-2 rounded-full" onClick={sendETH} disabled={loading}>
        {!loading ? (
          <BanknotesIcon className="h-4 w-4" />
        ) : (
          <span className="loading loading-spinner loading-xs"></span>
        )}
      </button>
    </div>
  );
};

const NUM_OF_ETH = "1";
const FAUCET_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

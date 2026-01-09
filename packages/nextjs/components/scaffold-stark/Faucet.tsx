"use client";

import { useCallback, useEffect, useState } from "react";
import GenericModal from "./CustomConnectButton/GenericModal";
import { Address as AddressType, devnet } from "@starknet-react/chains";
import { useNetwork, useProvider } from "@starknet-react/core";
import { useAccount } from "~~/hooks/useAccount";
import { BanknotesIcon, CurrencyDollarIcon } from "@heroicons/react/24/outline";
import { cairo, CallData } from "starknet";
import { FaucetProviderError } from "~~/components/common";
import { AddressInput, EtherInput } from "~~/components/scaffold-stark";
import { useScaffoldMultiWriteContract } from "~~/hooks/scaffold-stark";
import { mintStrk } from "~~/services/web3/faucet";
import { notification } from "~~/utils/scaffold-stark";

// Token addresses from Sepolia deployment
const TOKEN_ADDRESSES = {
  ETH: "0x07bb0505dde7c05f576a6e08e64dadccd7797f14704763a5ad955727be25e5e9",
  WBTC: "0x00abbd6f1e590eb83addd87ba5ac27960d859b1f17d11a3c1cd6a0006704b141",
  USDC: "0x0715649d4c493ca350743e43915b88d2e6838b1c78ddc23d6d9385446b9d6844",
};

/**
 * Faucet modal which lets you send ETH to any address.
 */
export const Faucet = () => {
  const [loading, setLoading] = useState(false);
  const [mintLoading, setMintLoading] = useState(false);
  const [inputAddress, setInputAddress] = useState<AddressType>();
  const [faucetAddress] = useState<AddressType>("0x78662e7352d062084b0010068b99288486c2d8b914f6e2a55ce945f8792c8b1");
  const [sendValue, setSendValue] = useState("1");
  const [mintModalOpen, setMintModalOpen] = useState(false);

  const { chain: ConnectedChain } = useNetwork();
  const { provider: publicClient } = useProvider();
  const { address: connectedAddress } = useAccount();

  // Prepare the mint calls for each token
  const mintCalls = connectedAddress 
    ? [
        // ETH - 1 ETH (18 decimals)
        {
          contractAddress: TOKEN_ADDRESSES.ETH,
          entrypoint: "mint",
          calldata: CallData.compile([connectedAddress, cairo.uint256(BigInt(10n ** 18n))]),
        },
        // WBTC - 1 WBTC (8 decimals)
        {
          contractAddress: TOKEN_ADDRESSES.WBTC,
          entrypoint: "mint",
          calldata: CallData.compile([connectedAddress, cairo.uint256(BigInt(10n ** 8n))]),
        },
        // USDC - 1000 USDC (6 decimals)
        {
          contractAddress: TOKEN_ADDRESSES.USDC,
          entrypoint: "mint",
          calldata: CallData.compile([connectedAddress, cairo.uint256(BigInt(1000n * 10n ** 6n))]),
        },
      ]
    : [];
    
  // Use the scaffold hook for multi-write
  const multiWriteResult = useScaffoldMultiWriteContract({ calls: mintCalls });
  const { sendAsync } = multiWriteResult;
  
  useEffect(() => {
    const checkChain = async () => {
      try {
        await publicClient.getBlock();
      } catch (error) {
        console.error("⚡️ ~ file: Faucet.tsx:checkChain ~ error", error);
        notification.error(
          <FaucetProviderError providerType="SN" />,
          {
            duration: 5000,
          },
        );
      }
    };
    checkChain().then();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Set the connected address as the default input address when it becomes available
    if (connectedAddress && !inputAddress) {
      setInputAddress(connectedAddress);
    }
  }, [connectedAddress, inputAddress]);

  const sendETH = useCallback(async () => {
    if (!faucetAddress || !inputAddress) {
      return;
    }

    const res = await mintStrk(inputAddress, sendValue);
    if (!res.new_balance) {
      setLoading(false);
      notification.error(`${res}`);
      return;
    }
    setLoading(false);
    setInputAddress(undefined);
    setSendValue("");
    notification.success("STRK sent successfully!");
  }, [faucetAddress, inputAddress, sendValue]);

  const mintLendingTokens = useCallback(async () => {
    console.log("Mint lending tokens clicked");
    console.log("Connected address:", connectedAddress);
    console.log("sendAsync available:", !!sendAsync);
    
    if (!connectedAddress) {
      notification.error("Please connect your wallet first");
      return;
    }

    if (!sendAsync) {
      console.error("sendAsync function is not available");
      notification.error("Transaction function not available. Check console for details.");
      return;
    }

    setMintLoading(true);
    try {
      console.log("About to execute mint transactions");
      // Execute all mint transactions via the scaffold hook
      const result = await sendAsync();
      console.log("Mint transaction result:", result);
      
      notification.success("Lending tokens minted successfully!");
    } catch (error) {
      console.error("Error minting tokens:", error);
      notification.error(`Failed to mint lending tokens: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setMintLoading(false);
      setMintModalOpen(false);
    }
  }, [connectedAddress, sendAsync]);

  const handleOpenMintModal = useCallback(() => {
    setMintModalOpen(true);
  }, []);

  const handleCloseMintModal = useCallback(() => {
    setMintModalOpen(false);
  }, []);

  const handleAddressChange = useCallback((value: string) => {
    setInputAddress(value as AddressType);
  }, []);

  const handleSendValueChange = useCallback((value: string) => {
    setSendValue(value);
  }, []);

  // Render only on local chain
  if (ConnectedChain?.id !== devnet.id) {
    return null;
  }

  return (
    <div className="flex gap-2">
      <label htmlFor="faucet-modal" className="btn btn-sm gap-1 border border-[#32BAC4] font-normal shadow-none">
        <BanknotesIcon className="size-4 text-[#32BAC4]" />
        <span>Faucet</span>
      </label>
      
      <label
        className="btn btn-sm gap-1 border border-[#32BAC4] font-normal shadow-none"
        onClick={handleOpenMintModal}
      >
        <CurrencyDollarIcon className="size-4 text-[#32BAC4]" />
        <span>Get lending tokens</span>
      </label>
      
      {/* STRK Faucet Modal */}
      <input type="checkbox" id="faucet-modal" className="modal-toggle" />
      <GenericModal modalId="faucet-modal">
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">Local Faucet</h3>
            <label htmlFor="faucet-modal" className="btn btn-ghost btn-sm btn-circle">
              ✕
            </label>
          </div>
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <span className="text-sm text-gray-400">Connected Account (Recipient)</span>
              <AddressInput
                placeholder="Destination Address"
                value={inputAddress ?? ""}
                onChange={handleAddressChange}
              />
            </div>
            <EtherInput placeholder="Amount to send" value={sendValue} onChange={handleSendValueChange} />
          </div>
          <button
            className="btn btn-sm bg-btn-wallet h-10 cursor-pointer rounded-[4px] border border-[#4f4ab7] px-2 hover:bg-[#385183]"
            onClick={sendETH}
            disabled={loading || !inputAddress}
          >
            {!loading ? (
              <BanknotesIcon className="size-6" />
            ) : (
              <span className="loading loading-spinner loading-sm"></span>
            )}
            <span>Send to Connected Account</span>
          </button>
        </>
      </GenericModal>
      
      {/* Lending Tokens Modal */}
      <div className={`modal ${mintModalOpen ? "modal-open" : ""}`}>
        <div className="modal-box bg-base-100 max-w-lg">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">Get Lending Tokens</h3>
            <button
              className="btn btn-ghost btn-sm btn-circle"
              onClick={handleCloseMintModal}
            >
              ✕
            </button>
          </div>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center justify-between">
              <span>ETH</span>
              <span>1 ETH (18 decimals)</span>
            </div>
            <div className="flex items-center justify-between">
              <span>WBTC</span>
              <span>1 WBTC (8 decimals)</span>
            </div>
            <div className="flex items-center justify-between">
              <span>USDC</span>
              <span>1000 USDC (6 decimals)</span>
            </div>
          </div>
          <button
            className="btn btn-sm bg-btn-wallet h-10 cursor-pointer rounded-[4px] border border-[#4f4ab7] px-2 hover:bg-[#385183]"
            onClick={mintLendingTokens}
            disabled={mintLoading || !connectedAddress}
          >
            {!mintLoading ? (
              <CurrencyDollarIcon className="size-6" />
            ) : (
              <span className="loading loading-spinner loading-sm"></span>
            )}
            <span>Mint Tokens to Connected Wallet</span>
          </button>
        </div>
      </div>
    </div>
  );
};

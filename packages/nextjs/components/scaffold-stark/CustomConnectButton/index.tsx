"use client";

// @refresh reset
import { useEffect, useMemo, useState } from "react";
import { Balance } from "../Balance";
import { AddressInfoDropdown } from "./AddressInfoDropdown";
import { AddressQRCodeModal } from "./AddressQRCodeModal";
import ConnectModal from "./ConnectModal";
import { WrongNetworkDropdown } from "./WrongNetworkDropdown";
import { Address } from "@starknet-react/chains";
import { useAccount, useConnect } from "@starknet-react/core";
import { useAutoConnect } from "~~/hooks/scaffold-stark";
import { useTargetNetwork } from "~~/hooks/scaffold-stark/useTargetNetwork";
import { getBlockExplorerAddressLink } from "~~/utils/scaffold-stark";

/**
 * Custom Connect Button (watch balance + custom design)
 */
export const CustomConnectButton = () => {
  useAutoConnect();
  const { connector } = useConnect();
  const { targetNetwork } = useTargetNetwork();
  const { account, status, address: accountAddress } = useAccount();
  const [accountChainId, setAccountChainId] = useState<bigint>(0n);

  const blockExplorerAddressLink = useMemo(() => {
    return accountAddress && getBlockExplorerAddressLink(targetNetwork, accountAddress);
  }, [accountAddress, targetNetwork]);

  // effect to get chain id and address from account
  useEffect(() => {
    if (account) {
      const getChainId = async () => {
        const chainId = await account.channel.getChainId();
        setAccountChainId(BigInt(chainId as string));
      };

      getChainId();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, status]);

  useEffect(() => {
    const handleChainChange = (event: { chainId?: bigint }) => {
      const { chainId } = event;
      if (chainId && chainId !== accountChainId) {
        setAccountChainId(chainId);
      }
    };
    connector?.on("change", handleChainChange);
    return () => {
      connector?.off("change", handleChainChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connector]);

  if (status === "disconnected" || accountChainId === 0n) return <ConnectModal />;

  if (accountChainId !== targetNetwork.id) {
    return <WrongNetworkDropdown />;
  }

  return (
    <>
      <AddressInfoDropdown
        address={accountAddress as Address}
        displayName={""}
        ensAvatar={""}
        blockExplorerAddressLink={blockExplorerAddressLink}
      />
      <AddressQRCodeModal address={accountAddress as Address} modalId="qrcode-modal" />
    </>
  );
};

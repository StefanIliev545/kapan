"use client";

import { useEffect, useMemo, useState } from "react";
import { default as NextImage } from "next/image";
import Link from "next/link";
import ConnectModal from "./CustomConnectButton/ConnectModal";
import { Address as AddressType } from "@starknet-react/chains";
import { devnet } from "@starknet-react/chains";
import { getChecksumAddress, validateChecksumAddress } from "starknet";
import { CheckCircleIcon, DocumentDuplicateIcon } from "@heroicons/react/24/outline";
import { BalanceSkeleton } from "~~/components/common";
import { BlockieAvatar } from "~~/components/scaffold-stark/BlockieAvatar";
import { useCopyToClipboard } from "~~/hooks/common/useCopyToClipboard";
import { useScaffoldStarkProfile } from "~~/hooks/scaffold-stark/useScaffoldStarkProfile";
import { useTargetNetwork } from "~~/hooks/scaffold-stark/useTargetNetwork";
import { getStarknetPFPIfExists } from "~~/utils/profile";
import { getBlockExplorerAddressLink } from "~~/utils/scaffold-stark";
import { truncateAddress } from "~~/utils/address";

type AddressProps = {
  address?: AddressType;
  disableAddressLink?: boolean;
  format?: "short" | "long";
  size?: "xs" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl";
};

const blockieSizeMap = {
  xs: 6,
  sm: 7,
  base: 8,
  lg: 9,
  xl: 10,
  "2xl": 12,
  "3xl": 15,
};

/**
 * Displays an address (or ENS) with a Blockie image and option to copy address.
 */
export const Address = ({ address, disableAddressLink, format, size = "base" }: AddressProps) => {
  const [ensAvatar, setEnsAvatar] = useState<string | null>();
  const { copy, isCopied: addressCopied } = useCopyToClipboard();

  const { targetNetwork } = useTargetNetwork();
  const { data: fetchedProfile, isLoading } = useScaffoldStarkProfile(address);

  const checkSumAddress = useMemo(() => {
    if (!address) return undefined;

    if (address.toLowerCase() === "0x") {
      return "0x0";
    }

    return getChecksumAddress(address);
  }, [address]);

  const blockExplorerAddressLink = getBlockExplorerAddressLink(targetNetwork, checkSumAddress || address || "");

  const isValidHexAddress = (value: string): boolean => {
    if (value.toLowerCase() === "0x") {
      value = "0x0";
    }

    if (value.toLowerCase() === "0x0x0") {
      return false;
    }

    const hexAddressRegex = /^0x[0-9a-fA-F]+$/;
    return hexAddressRegex.test(value);
  };

  const [displayAddress, setDisplayAddress] = useState(
    truncateAddress(checkSumAddress),
  );

  useEffect(() => {
    const addressWithFallback = checkSumAddress || address || "";

    if (fetchedProfile?.name) {
      setDisplayAddress(fetchedProfile.name);
    } else if (format === "long") {
      setDisplayAddress(addressWithFallback || "");
    } else {
      setDisplayAddress(truncateAddress(addressWithFallback));
    }
  }, [fetchedProfile, checkSumAddress, address, format]);

  // Skeleton UI
  if (isLoading) {
    return <BalanceSkeleton />;
  }

  if (!checkSumAddress) {
    return <div className="text-base font-bold italic ">Wallet not connected</div>;
  }

  if (!checkSumAddress) {
    return <span className="text-error">Invalid address format</span>;
  }

  return (
    <div className="flex items-center">
      <div className="flex-shrink-0">
        {getStarknetPFPIfExists(fetchedProfile?.profilePicture) ? (
          <NextImage
            src={fetchedProfile?.profilePicture || ""}
            alt="Profile Picture"
            className="rounded-full"
            width={24}
            height={24}
          />
        ) : (
          <BlockieAvatar
            address={checkSumAddress}
            size={(blockieSizeMap[size] * 24) / blockieSizeMap["base"]}
            ensImage={ensAvatar}
          />
        )}
      </div>
      {disableAddressLink ? (
        <span className={`text- ml-1.5${size} font-normal`}>{fetchedProfile?.name || displayAddress}</span>
      ) : targetNetwork.network === devnet.network ? (
        <span className={`text- ml-1.5${size} font-normal`}>
          <Link href={blockExplorerAddressLink}>{fetchedProfile?.name || displayAddress}</Link>
        </span>
      ) : (
        <a
          className={`text- ml-1.5${size} font-normal`}
          target="_blank"
          href={blockExplorerAddressLink}
          rel="noopener noreferrer"
        >
          {fetchedProfile?.name || displayAddress}
        </a>
      )}
      <button
        onClick={() => copy(checkSumAddress)}
        className="ml-1.5 cursor-pointer border-0 bg-transparent p-0"
        type="button"
      >
        {addressCopied ? (
          <CheckCircleIcon
            className="size-5 text-xl font-normal text-sky-600"
            aria-hidden="true"
          />
        ) : (
          <DocumentDuplicateIcon
            className="size-5 text-xl font-normal text-sky-600"
            aria-hidden="true"
          />
        )}
      </button>
    </div>
  );
};

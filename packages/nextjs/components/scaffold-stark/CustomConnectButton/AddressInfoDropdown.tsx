import { useRef, useState } from "react";
import { default as NextImage } from "next/image";
import { NetworkOptions } from "./NetworkOptions";
import { Address } from "@starknet-react/chains";
import { useConnect, useDisconnect, useNetwork } from "@starknet-react/core";
import { useTheme } from "next-themes";
import { createPortal } from "react-dom";
import {
  ArrowLeftEndOnRectangleIcon,
  ArrowTopRightOnSquareIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  DocumentDuplicateIcon,
  QrCodeIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { BlockieAvatar, isENS } from "~~/components/scaffold-stark";
import { useOutsideClick, useCopyToClipboard } from "~~/hooks/scaffold-stark";
import { useScaffoldStarkProfile } from "~~/hooks/scaffold-stark/useScaffoldStarkProfile";
import { getStarknetPFPIfExists } from "~~/utils/profile";
import { getTargetNetworks } from "~~/utils/scaffold-stark";
import { truncateAddress } from "~~/utils/address";

type AddressInfoDropdownProps = {
  address: Address;
  blockExplorerAddressLink: string | undefined;
  displayName: string;
  ensAvatar?: string;
};

export const AddressInfoDropdown = ({
  address,
  ensAvatar,
  displayName,
  blockExplorerAddressLink,
}: AddressInfoDropdownProps) => {
  const { disconnect } = useDisconnect();
  const { copy, isCopied: addressCopied } = useCopyToClipboard();
  const { data: profile } = useScaffoldStarkProfile(address);
  const { chain } = useNetwork();
  const [selectingNetwork, setSelectingNetwork] = useState(false);
  const { connectors, connect } = useConnect();
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === "dark";
  const dropdownRef = useRef<HTMLDetailsElement>(null);
  const closeDropdown = () => {
    setSelectingNetwork(false);
    dropdownRef.current?.removeAttribute("open");
  };

  useOutsideClick(dropdownRef, closeDropdown);

  return (
    <>
      <details ref={dropdownRef} className="dropdown dropdown-end inline-block">
        <summary
          tabIndex={0}
          className="flex items-center gap-2 min-w-0 cursor-pointer hover:opacity-80 transition-opacity duration-200 py-1"
        >
          <div className="flex-shrink-0">
            <BlockieAvatar address={address} size={24} ensImage={profile?.profilePicture || ensAvatar} />
          </div>
          <span className="text-sm font-medium truncate min-w-0">
            {isENS(displayName) ? displayName : profile?.name || truncateAddress(address)}
          </span>
          <ChevronDownIcon className="h-4 w-4 text-base-content/70" />
        </summary>
        <ul
          tabIndex={0}
          className="dropdown-content menu z-[2] p-2 mt-2 shadow-center shadow-accent bg-base-200 rounded-box gap-1"
        >
          <NetworkOptions hidden={!selectingNetwork} />
          <li className={selectingNetwork ? "hidden" : ""}>
            <button
              onClick={() => copy(address)}
              className="btn-sm !rounded-xl flex gap-3 py-3"
              type="button"
            >
              {addressCopied ? (
                <CheckCircleIcon className="text-xl font-normal h-6 w-4 ml-2 sm:ml-0" aria-hidden="true" />
              ) : (
                <DocumentDuplicateIcon className="text-xl font-normal h-6 w-4 ml-2 sm:ml-0" aria-hidden="true" />
              )}
              <span className="whitespace-nowrap">Copy address</span>
            </button>
          </li>
          {chain.network != "devnet" ? (
            <li className={selectingNetwork ? "hidden" : ""}>
              <button className="menu-item btn-sm !rounded-xl flex gap-3 py-3" type="button">
                <ArrowTopRightOnSquareIcon className="h-6 w-4 ml-2 sm:ml-0" />
                <a target="_blank" href={blockExplorerAddressLink} rel="noopener noreferrer" className="whitespace-nowrap">
                  View on Block Explorer
                </a>
              </button>
            </li>
          ) : null}

          <li className={selectingNetwork ? "hidden" : ""}>
            <button className="menu-item text-secondary-content btn-sm !rounded-xl flex gap-3 py-3" type="button" onClick={() => disconnect()}>
              <ArrowLeftEndOnRectangleIcon className="h-6 w-4 ml-2 sm:ml-0" /> <span>Disconnect</span>
            </button>
          </li>
        </ul>
      </details>
    </>
  );
};

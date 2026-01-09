import { useRef, useState } from "react";
import { NetworkOptions } from "./NetworkOptions";
import { Address } from "@starknet-react/chains";
import { useDisconnect, useNetwork } from "@starknet-react/core";
import {
  ArrowLeftEndOnRectangleIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  DocumentDuplicateIcon,
} from "@heroicons/react/24/outline";
import { BlockieAvatar, isENS } from "~~/components/scaffold-stark";
import { useOutsideClick, useCopyToClipboard } from "~~/hooks/scaffold-stark";
import { useScaffoldStarkProfile } from "~~/hooks/scaffold-stark/useScaffoldStarkProfile";
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
          className="flex min-w-0 cursor-pointer items-center gap-2 py-1 transition-opacity duration-200 hover:opacity-80"
        >
          <div className="flex-shrink-0">
            <BlockieAvatar address={address} size={24} ensImage={profile?.profilePicture || ensAvatar} />
          </div>
          <span className="min-w-0 truncate text-sm font-medium">
            {isENS(displayName) ? displayName : profile?.name || truncateAddress(address)}
          </span>
          <ChevronDownIcon className="text-base-content/70 size-4" />
        </summary>
        <ul
          tabIndex={0}
          className="dropdown-content menu shadow-center shadow-accent bg-base-200 rounded-box z-[2] mt-2 gap-1 p-2"
        >
          <NetworkOptions hidden={!selectingNetwork} />
          <li className={selectingNetwork ? "hidden" : ""}>
            <button
              onClick={() => copy(address)}
              className="btn-sm flex gap-3 !rounded-xl py-3"
              type="button"
            >
              {addressCopied ? (
                <CheckCircleIcon className="ml-2 h-6 w-4 text-xl font-normal sm:ml-0" aria-hidden="true" />
              ) : (
                <DocumentDuplicateIcon className="ml-2 h-6 w-4 text-xl font-normal sm:ml-0" aria-hidden="true" />
              )}
              <span className="whitespace-nowrap">Copy address</span>
            </button>
          </li>
          {chain.network != "devnet" ? (
            <li className={selectingNetwork ? "hidden" : ""}>
              <button className="menu-item btn-sm flex gap-3 !rounded-xl py-3" type="button">
                <ArrowTopRightOnSquareIcon className="ml-2 h-6 w-4 sm:ml-0" />
                <a target="_blank" href={blockExplorerAddressLink} rel="noopener noreferrer" className="whitespace-nowrap">
                  View on Block Explorer
                </a>
              </button>
            </li>
          ) : null}

          <li className={selectingNetwork ? "hidden" : ""}>
            <button className="menu-item text-secondary-content btn-sm flex gap-3 !rounded-xl py-3" type="button" onClick={() => disconnect()}>
              <ArrowLeftEndOnRectangleIcon className="ml-2 h-6 w-4 sm:ml-0" /> <span>Disconnect</span>
            </button>
          </li>
        </ul>
      </details>
    </>
  );
};

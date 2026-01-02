import { useRef, useState } from "react";
import Link from "next/link";
import { NetworkOptions } from "./NetworkOptions";
import CopyToClipboard from "react-copy-to-clipboard";
import { getAddress } from "viem";
import { Address } from "viem";
import { useDisconnect } from "wagmi";
import {
  ArrowLeftOnRectangleIcon,
  ArrowTopRightOnSquareIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  DocumentDuplicateIcon,
  QrCodeIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";
import { BlockieAvatar, isENS } from "~~/components/scaffold-eth";
import { useOutsideClick } from "~~/hooks/scaffold-eth";
import { getTargetNetworks } from "~~/utils/scaffold-eth";

const allowedNetworks = getTargetNetworks();

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
  const checkSumAddress = getAddress(address);

  const [addressCopied, setAddressCopied] = useState(false);
  const [selectingNetwork, setSelectingNetwork] = useState(false);
  const dropdownRef = useRef<HTMLDetailsElement>(null);
  
  const closeDropdown = () => {
    setSelectingNetwork(false);
    dropdownRef.current?.removeAttribute("open");
  };
  useOutsideClick(dropdownRef, closeDropdown);

  return (
    <details ref={dropdownRef} className="dropdown dropdown-end leading-3 flex-none">
      <summary tabIndex={0} className="flex items-center gap-2 cursor-pointer hover:bg-base-200 transition-colors rounded-lg px-2 py-1.5">
        <BlockieAvatar address={checkSumAddress} size={24} ensImage={ensAvatar} />
        <span className="text-sm font-medium">
          {isENS(displayName) ? displayName : `${checkSumAddress?.slice(0, 6)}...${checkSumAddress?.slice(-4)}`}
        </span>
        <ChevronDownIcon className="h-4 w-4 text-base-content/50" />
      </summary>
      
      <div className="dropdown-content z-[2] mt-2 w-64 bg-base-100 rounded-xl shadow-lg border border-base-200 overflow-hidden">
        <NetworkOptions hidden={!selectingNetwork} />
        
        {!selectingNetwork && (
          <>
            {/* Address Header */}
            <div className="px-4 py-3 border-b border-base-200">
              <div className="flex items-center gap-3">
                <BlockieAvatar address={checkSumAddress} size={40} ensImage={ensAvatar} />
                <div className="min-w-0">
                  {isENS(displayName) && (
                    <p className="font-medium truncate">{displayName}</p>
                  )}
                  <p className="text-sm text-base-content/50 font-mono">
                    {checkSumAddress?.slice(0, 6)}...{checkSumAddress?.slice(-4)}
                  </p>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="py-2">
              {/* Orders Link */}
              <Link
                href="/orders"
                onClick={closeDropdown}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-base-200 transition-colors"
              >
                <ClipboardDocumentListIcon className="h-5 w-5 text-base-content/60" />
                <span className="text-sm">Your Orders</span>
              </Link>

              {/* Copy Address */}
              <CopyToClipboard
                text={checkSumAddress}
                onCopy={() => {
                  setAddressCopied(true);
                  setTimeout(() => setAddressCopied(false), 800);
                }}
              >
                <button className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-base-200 transition-colors">
                  {addressCopied ? (
                    <CheckCircleIcon className="h-5 w-5 text-success" />
                  ) : (
                    <DocumentDuplicateIcon className="h-5 w-5 text-base-content/60" />
                  )}
                  <span className="text-sm">{addressCopied ? "Copied!" : "Copy Address"}</span>
                </button>
              </CopyToClipboard>

              {/* QR Code */}
              <label
                htmlFor="qrcode-modal"
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-base-200 transition-colors cursor-pointer"
              >
                <QrCodeIcon className="h-5 w-5 text-base-content/60" />
                <span className="text-sm">QR Code</span>
              </label>

              {/* Block Explorer */}
              <a
                href={blockExplorerAddressLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-base-200 transition-colors"
              >
                <ArrowTopRightOnSquareIcon className="h-5 w-5 text-base-content/60" />
                <span className="text-sm">Block Explorer</span>
                <ArrowTopRightOnSquareIcon className="h-3 w-3 text-base-content/40 ml-auto" />
              </a>

              {/* Switch Network */}
              {allowedNetworks.length > 1 && (
                <button
                  onClick={() => setSelectingNetwork(true)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-base-200 transition-colors"
                >
                  <ArrowsRightLeftIcon className="h-5 w-5 text-base-content/60" />
                  <span className="text-sm">Switch Network</span>
                </button>
              )}
            </div>

            {/* Disconnect */}
            <div className="border-t border-base-200 py-2">
              <button
                onClick={() => disconnect()}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-error/10 transition-colors text-error"
              >
                <ArrowLeftOnRectangleIcon className="h-5 w-5" />
                <span className="text-sm">Disconnect</span>
              </button>
            </div>
          </>
        )}
      </div>
    </details>
  );
};

import { useRef, useState, useCallback } from "react";
import Link from "next/link";
import { NetworkOptions } from "./NetworkOptions";
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
import { useOutsideClick, useCopyToClipboard } from "~~/hooks/scaffold-eth";
import { getTargetNetworks } from "~~/utils/scaffold-eth";
import { truncateAddress } from "~~/utils/address";

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

  const { copy, isCopied: addressCopied } = useCopyToClipboard();
  const [selectingNetwork, setSelectingNetwork] = useState(false);
  const dropdownRef = useRef<HTMLDetailsElement>(null);

  const closeDropdown = useCallback(() => {
    setSelectingNetwork(false);
    dropdownRef.current?.removeAttribute("open");
  }, []);
  useOutsideClick(dropdownRef, closeDropdown);

  const handleCopyAddress = useCallback(() => {
    copy(checkSumAddress);
  }, [copy, checkSumAddress]);

  const handleSelectNetwork = useCallback(() => {
    setSelectingNetwork(true);
  }, []);

  const handleDisconnect = useCallback(() => {
    disconnect();
  }, [disconnect]);

  return (
    <details ref={dropdownRef} className="dropdown dropdown-end flex-none leading-3">
      <summary tabIndex={0} className="hover:bg-base-200 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors">
        <BlockieAvatar address={checkSumAddress} size={24} ensImage={ensAvatar} />
        <span className="text-sm font-medium">
          {isENS(displayName) ? displayName : truncateAddress(checkSumAddress)}
        </span>
        <ChevronDownIcon className="text-base-content/50 size-4" />
      </summary>

      <div className="dropdown-content bg-base-100 border-base-200 z-[2] mt-2 w-64 overflow-hidden rounded-xl border shadow-lg">
        <NetworkOptions hidden={!selectingNetwork} />

        {!selectingNetwork && (
          <>
            {/* Address Header */}
            <div className="border-base-200 border-b px-4 py-3">
              <div className="flex items-center gap-3">
                <BlockieAvatar address={checkSumAddress} size={40} ensImage={ensAvatar} />
                <div className="min-w-0">
                  {isENS(displayName) && (
                    <p className="truncate font-medium">{displayName}</p>
                  )}
                  <p className="text-base-content/50 font-mono text-sm">
                    {truncateAddress(checkSumAddress)}
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
                className="hover:bg-base-200 flex items-center gap-3 px-4 py-2.5 transition-colors"
              >
                <ClipboardDocumentListIcon className="text-base-content/60 size-5" />
                <span className="text-sm">Your Orders</span>
              </Link>

              {/* Copy Address */}
              <button
                onClick={handleCopyAddress}
                className="hover:bg-base-200 flex w-full items-center gap-3 px-4 py-2.5 transition-colors"
              >
                {addressCopied ? (
                  <CheckCircleIcon className="text-success size-5" />
                ) : (
                  <DocumentDuplicateIcon className="text-base-content/60 size-5" />
                )}
                <span className="text-sm">{addressCopied ? "Copied!" : "Copy Address"}</span>
              </button>

              {/* QR Code */}
              <label
                htmlFor="qrcode-modal"
                className="hover:bg-base-200 flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors"
              >
                <QrCodeIcon className="text-base-content/60 size-5" />
                <span className="text-sm">QR Code</span>
              </label>

              {/* Block Explorer */}
              <a
                href={blockExplorerAddressLink}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:bg-base-200 flex items-center gap-3 px-4 py-2.5 transition-colors"
              >
                <ArrowTopRightOnSquareIcon className="text-base-content/60 size-5" />
                <span className="text-sm">Block Explorer</span>
                <ArrowTopRightOnSquareIcon className="text-base-content/40 ml-auto size-3" />
              </a>

              {/* Switch Network */}
              {allowedNetworks.length > 1 && (
                <button
                  onClick={handleSelectNetwork}
                  className="hover:bg-base-200 flex w-full items-center gap-3 px-4 py-2.5 transition-colors"
                >
                  <ArrowsRightLeftIcon className="text-base-content/60 size-5" />
                  <span className="text-sm">Switch Network</span>
                </button>
              )}
            </div>

            {/* Disconnect */}
            <div className="border-base-200 border-t py-2">
              <button
                onClick={handleDisconnect}
                className="hover:bg-error/10 text-error flex w-full items-center gap-3 px-4 py-2.5 transition-colors"
              >
                <ArrowLeftOnRectangleIcon className="size-5" />
                <span className="text-sm">Disconnect</span>
              </button>
            </div>
          </>
        )}
      </div>
    </details>
  );
};

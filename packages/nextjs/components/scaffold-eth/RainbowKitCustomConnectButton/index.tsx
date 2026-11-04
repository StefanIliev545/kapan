"use client";

// @refresh reset
import { AddressInfoDropdown } from "./AddressInfoDropdown";
import { AddressQRCodeModal } from "./AddressQRCodeModal";
import { NetworkSwitcher } from "./NetworkSwitcher";
import { WrongNetworkDropdown } from "./WrongNetworkDropdown";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Address } from "viem";
import { EnvelopeIcon } from "@heroicons/react/24/outline";
import { EmailWalletPending } from "~~/components/wallet/EmailWalletPending";
import { useEvmWalletSession } from "~~/components/wallet/EvmWalletSession";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { getBlockExplorerAddressLink } from "~~/utils/scaffold-eth";

/**
 * Custom Wagmi Connect Button (watch balance + custom design)
 */
export const RainbowKitCustomConnectButton = () => {
  const { targetNetwork } = useTargetNetwork();
  const session = useEvmWalletSession();

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, mounted }) => {
        const connected = mounted && account && chain;
        const blockExplorerAddressLink = account
          ? getBlockExplorerAddressLink(targetNetwork, account.address)
          : undefined;

        return (
          <>
            {(() => {
              if (!connected) {
                if (session.kind === "email") {
                  return <EmailWalletPending />;
                }

                return (
                  <div className="flex items-center gap-3 whitespace-nowrap">
                    <button
                      type="button"
                      className="text-primary w-full text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                      onClick={openConnectModal}
                      disabled={!mounted}
                    >
                      Connect wallet
                    </button>
                    {session.loginWithEmail && (
                      <>
                        <span className="bg-base-content/15 h-4 w-px" aria-hidden="true" />
                        <button
                          type="button"
                          onClick={session.loginWithEmail}
                          disabled={!session.ready}
                          className="text-base-content/75 hover:text-base-content flex items-center gap-1.5 text-sm disabled:opacity-50"
                          title="Sign in with email to create or recover an email wallet"
                        >
                          <EnvelopeIcon className="size-4" aria-hidden="true" />
                          Email
                        </button>
                      </>
                    )}
                  </div>
                );
              }

              if (chain.unsupported || chain.id !== targetNetwork.id) {
                return <WrongNetworkDropdown />;
              }

              return (
                <div className="flex w-full items-center gap-1">
                  <NetworkSwitcher />
                  <div className="bg-base-300 h-8 w-[1px]"></div>
                  <AddressInfoDropdown
                    address={account.address as Address}
                    displayName={account.displayName}
                    ensAvatar={account.ensAvatar}
                    blockExplorerAddressLink={blockExplorerAddressLink}
                  />
                  <AddressQRCodeModal address={account.address as Address} modalId="qrcode-modal" />
                </div>
              );
            })()}
          </>
        );
      }}
    </ConnectButton.Custom>
  );
};

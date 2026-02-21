"use client";

import type { FC } from "react";
import dynamic from "next/dynamic";
import { XMarkIcon } from "@heroicons/react/24/outline";

// Lazy-load the LI.FI widget to keep bundle size down
const LiFiWidget = dynamic(
  () => import("@lifi/widget").then(m => ({ default: m.LiFiWidget })),
  { ssr: false }
);

// EVM chain IDs supported by Kapan that LI.FI also supports
const BRIDGEABLE_CHAIN_IDS = [1, 42161, 8453, 10, 59144]; // mainnet, arbitrum, base, optimism, linea

// Override "Exchange" header text to "Bridge" and adjust related labels
const LANGUAGE_OVERRIDES = {
  en: {
    header: {
      exchange: "Bridge",
      from: "From",
      to: "To",
    },
  },
};

interface BridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Source chain ID */
  chainId: number;
  /** Token address to bridge from (optional, pre-fills the widget) */
  fromToken?: string;
}

export const BridgeModal: FC<BridgeModalProps> = ({
  isOpen,
  onClose,
  chainId,
  fromToken,
}) => {
  if (!isOpen) return null;

  return (
    <dialog className="modal modal-open">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal content — sized for the widget */}
      <div className="modal-box bg-base-100 border-base-300/50 relative max-w-[420px] overflow-hidden rounded-xl border p-0 shadow-xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="text-base-content/40 hover:text-base-content hover:bg-base-200 absolute right-3 top-3 z-10 rounded-lg p-1.5 transition-colors"
        >
          <XMarkIcon className="size-5" />
        </button>

        {/* LI.FI Widget — configured for bridge-only */}
        <LiFiWidget
          integrator="kapan-finance"
          config={{
            appearance: "dark",
            fromChain: chainId,
            fromToken: fromToken,
            chains: { allow: BRIDGEABLE_CHAIN_IDS },
            // TODO: subvariant "split" with defaultTab "bridge" would be ideal
            // but requires testing with this widget version
            languageResources: LANGUAGE_OVERRIDES,
            hiddenUI: ["poweredBy", "appearance"],
          }}
        />

        {/* Powered by LI.FI attribution */}
        <div className="border-base-300/30 flex items-center justify-center gap-1.5 border-t px-3 py-2">
          <span className="text-base-content/30 text-[10px]">Powered by</span>
          <span className="text-[10px] font-semibold text-base-content/40">LI.FI</span>
        </div>
      </div>
    </dialog>
  );
};

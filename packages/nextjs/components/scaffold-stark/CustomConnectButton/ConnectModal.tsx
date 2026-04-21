import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useAccount, useConnect, type Connector } from "@starknet-react/core";
import { LAST_CONNECTED_TIME_LOCALSTORAGE_KEY } from "~~/utils/Constants";
import { clearStarknetSession } from "~~/utils/starknetSession";
import { useOutsideClick } from "~~/hooks/scaffold-stark";

// NOTE: we used to open starknetkit's `useStarknetkitConnectModal` here.
// starknetkit@3.0.3's modal has a build artifact bug (TDZ — "Cannot access
// 'e' before initialization") that appears in production mode and makes
// the picker crash silently after the spinner. We already register every
// wallet as a starknet-react connector via `useInjectedConnectors` +
// starknetkit's own connector classes (Fordefi/Keplr/MetaMask) +
// Cartridge, so we don't need starknetkit's modal — a direct in-app
// picker is smaller, works, and doesn't drag in the broken dep.

const KNOWN_LOGOS: Record<string, string> = {
  braavos: "/logos/braavos.svg",
  "argentX": "/logos/argent.svg",
  argent: "/logos/argent.svg",
  "argent-mobile": "/logos/argent.svg",
  "argentMobile": "/logos/argent.svg",
  "argent-webwallet": "/logos/argent.svg",
  "argentWebWallet": "/logos/argent.svg",
  controller: "/logos/cartridge.svg",
  fordefi: "/logos/fordefi.svg",
  keplr: "/logos/keplr.svg",
  metamask: "/logos/metamask.svg",
};

function getConnectorLogo(connector: Connector): string | undefined {
  // Try the connector's own icon first (starknet-react v5 exposes `icon`
  // either as a string or { light, dark }). Fall back to our static map.
  const icon = (connector as any).icon;
  if (typeof icon === "string" && icon.length > 0) return icon;
  if (icon && typeof icon === "object") {
    if (typeof icon.light === "string" && icon.light.length > 0) return icon.light;
    if (typeof icon.dark === "string" && icon.dark.length > 0) return icon.dark;
  }
  return KNOWN_LOGOS[connector.id] ?? KNOWN_LOGOS[connector.id.toLowerCase()];
}

const ConnectModal = () => {
  // Use connectAsync: `connect` is fire-and-forget (returns void), so
  // `await connect(...)` resolves on undefined while the underlying
  // react-query mutation is still in flight — the user-gesture context is
  // then lost by the time the connector's `connect()` actually runs, which
  // breaks popup-opening connectors like Cartridge Controller.
  const { connectAsync, connectors } = useConnect();
  const { status } = useAccount();

  const [isOpen, setIsOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Auto-close the modal once a connection actually lands. Some connectors
  // (notably Cartridge Controller) never reject their `connectAsync` promise
  // when the user cancels the external popup — we detect success via the
  // account status transition here instead of waiting on the promise.
  useEffect(() => {
    if (status === "connected" && isOpen) {
      setIsOpen(false);
      setPendingId(null);
    }
  }, [status, isOpen]);

  // When our tab regains focus with a pending connector, the external popup
  // was most likely closed. Cartridge's promise never settles on cancel, so
  // without this handler the wallet button stays spinning forever.
  // Short grace period lets a successful connection land first.
  useEffect(() => {
    if (!pendingId) return;
    const onFocus = () => {
      window.setTimeout(() => {
        setPendingId(current => (current === pendingId ? null : current));
      }, 500);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [pendingId]);

  // Closing the modal also cancels any in-flight pending state. Needed
  // because some connectors (notably Cartridge Controller) open an external
  // popup and the user can dismiss that popup without any promise ever
  // resolving — our connectAsync call would otherwise hang forever and the
  // UI would stay stuck on the spinner.
  const closeModal = () => {
    setIsOpen(false);
    setPendingId(null);
  };

  useOutsideClick(dialogRef, closeModal);

  // Order: Argent / Braavos first (most common), then the rest.
  const orderedConnectors = useMemo(() => {
    const priority = ["argentX", "argent-x", "braavos"];
    return [...connectors].sort((a, b) => {
      const ai = priority.indexOf(a.id);
      const bi = priority.indexOf(b.id);
      if (ai === -1 && bi === -1) return a.name?.localeCompare(b.name ?? "") ?? 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [connectors]);

  async function onPick(connector: Connector) {
    if (pendingId) return;
    setPendingId(connector.id);
    try {
      await connectAsync({ connector });
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(LAST_CONNECTED_TIME_LOCALSTORAGE_KEY, Date.now().toString());
        }
      } catch {}
      setIsOpen(false);
    } catch (err) {
      // Surface the real wallet-side error and wipe any stored connector id
      // so the user isn't auto-bound to a broken wallet next refresh.
      console.error("[Starknet connect failed]", err);
      clearStarknetSession();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-primary dark:text-accent flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm font-semibold transition-opacity duration-200 hover:opacity-80"
      >
        <span>Connect Starknet</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div
            ref={dialogRef}
            className="bg-base-100 border-base-300 w-full max-w-sm rounded-xl border p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base-content text-sm font-semibold">Connect Starknet wallet</h2>
              <button
                type="button"
                className="text-base-content/60 hover:text-base-content text-xs"
                onClick={closeModal}
              >
                Close
              </button>
            </div>

            <ul className="flex flex-col gap-2">
              {orderedConnectors.map(connector => {
                const logo = getConnectorLogo(connector);
                const isPending = pendingId === connector.id;
                return (
                  <li key={connector.id}>
                    <button
                      type="button"
                      onClick={() => onPick(connector)}
                      disabled={!!pendingId}
                      className="border-base-300 hover:bg-base-200 flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {logo ? (
                        <Image src={logo} alt="" width={24} height={24} className="size-6 rounded" />
                      ) : (
                        <div className="bg-base-300 size-6 rounded" />
                      )}
                      <span className="flex-1 text-sm">{connector.name ?? connector.id}</span>
                      {isPending && <span className="loading loading-spinner loading-xs" />}
                    </button>
                  </li>
                );
              })}
            </ul>

            {orderedConnectors.length === 0 && (
              <p className="text-base-content/60 py-6 text-center text-xs">
                No Starknet wallets detected. Install Argent X or Braavos and refresh.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ConnectModal;

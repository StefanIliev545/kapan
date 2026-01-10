import { useState } from "react";
import { useConnect } from "@starknet-react/core";
import { type StarknetkitConnector, useStarknetkitConnectModal } from "starknetkit";
import { LAST_CONNECTED_TIME_LOCALSTORAGE_KEY } from "~~/utils/Constants";

const ConnectModal = () => {
  const { connect, connectors } = useConnect();
  const { starknetkitConnectModal } = useStarknetkitConnectModal({
    connectors: connectors as StarknetkitConnector[],
  });

  const [isConnecting, setIsConnecting] = useState(false);

  async function connectWallet() {
    setIsConnecting(true);
    try {
      const { connector } = await starknetkitConnectModal();
      if (!connector) {
        return;
      }

      await connect({ connector });
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("lastUsedConnector", JSON.stringify({ id: connector.id }));
          window.localStorage.setItem(LAST_CONNECTED_TIME_LOCALSTORAGE_KEY, Date.now().toString());
        }
      } catch {}
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <button
      onClick={connectWallet}
      disabled={isConnecting}
      className="text-primary dark:text-accent flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm font-semibold transition-opacity duration-200 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isConnecting && <span className="loading loading-spinner loading-xs"></span>}
      <span>Connect Starknet</span>
    </button>
  );
};

export default ConnectModal;

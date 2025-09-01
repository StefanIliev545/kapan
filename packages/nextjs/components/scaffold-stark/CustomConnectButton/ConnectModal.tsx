import { useConnect } from "@starknet-react/core";
import { type StarknetkitConnector, useStarknetkitConnectModal } from "starknetkit";
import { LAST_CONNECTED_TIME_LOCALSTORAGE_KEY } from "~~/utils/Constants";

const ConnectModal = () => {
  const { connect, connectors } = useConnect();
  const { starknetkitConnectModal } = useStarknetkitConnectModal({
    connectors: connectors as StarknetkitConnector[],
  });

  async function connectWallet() {
    const { connector } = await starknetkitConnectModal();
    if (!connector) {
      return;
    }

    await connect({ connector });
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("lastUsedConnector", JSON.stringify({ id: connector.id }));
        window.localStorage.setItem(
          LAST_CONNECTED_TIME_LOCALSTORAGE_KEY,
          Date.now().toString(),
        );
      }
    } catch {}
  }

  return (
    <div
      onClick={connectWallet}
      className="text-sm font-semibold text-primary dark:text-accent hover:opacity-80 transition-opacity duration-200 cursor-pointer whitespace-nowrap"
    >
      Connect Starknet
    </div>
  );
};

export default ConnectModal;

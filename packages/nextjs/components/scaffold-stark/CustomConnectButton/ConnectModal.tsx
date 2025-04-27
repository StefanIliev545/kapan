import { useConnect } from "@starknet-react/core";
import { type StarknetkitConnector, useStarknetkitConnectModal } from "starknetkit";
import { useLocalStorage } from "usehooks-ts";

const ConnectModal = () => {
  const { connect, connectors } = useConnect();
  const { starknetkitConnectModal } = useStarknetkitConnectModal({
    connectors: connectors as StarknetkitConnector[],
  });

  const [_, setLastConnector] = useLocalStorage<{ id: string; ix?: number }>(
    "lastUsedConnector",
    { id: "" },
    {
      initializeWithValue: false,
    },
  );

  async function connectWallet() {
    const { connector } = await starknetkitConnectModal();
    if (!connector) {
      return;
    }

    await connect({ connector });
    setLastConnector({ id: connector.id });
  }

  return (
    <div
      onClick={connectWallet}
      className="text-sm font-semibold text-primary hover:opacity-80 transition-opacity duration-200 cursor-pointer whitespace-nowrap"
    >
      Connect Starknet
    </div>
  );
};

export default ConnectModal;

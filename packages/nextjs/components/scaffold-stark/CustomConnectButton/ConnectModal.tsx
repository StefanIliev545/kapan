import { useStarknetkitConnectModal, type StarknetkitConnector } from "starknetkit";
import { useConnect } from "@starknet-react/core";

const ConnectModal = () => {
  const { connect, connectors } = useConnect();
  const { starknetkitConnectModal } = useStarknetkitConnectModal({
    connectors: connectors as StarknetkitConnector[]
  });

  async function connectWallet() {
    const { connector } = await starknetkitConnectModal();
    if (!connector) {
      return;
    }

    await connect({ connector });
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

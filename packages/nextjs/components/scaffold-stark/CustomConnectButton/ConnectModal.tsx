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
    <div>
      <button 
        onClick={connectWallet}
        className="rounded-[18px] btn-sm font-bold px-8 bg-btn-wallet py-3 cursor-pointer"
      >
        Connect
      </button>
    </div>
  );
};

export default ConnectModal;

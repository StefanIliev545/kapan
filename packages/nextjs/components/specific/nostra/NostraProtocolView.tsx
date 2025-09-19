import { FC } from "react";

import { ProtocolView } from "../../ProtocolView";
import { useAccount } from "~~/hooks/useAccount";
import { NostraTokensProvider } from "~~/contexts/NostraTokensContext";
import { useNostraLendingPositions } from "~~/hooks/useNostraLendingPositions";

const NostraProtocolViewContent: FC<{ connectedAddress?: string }> = ({ connectedAddress }) => {
  const { suppliedPositions, borrowedPositions } = useNostraLendingPositions();

  return (
    <ProtocolView
      protocolName="Nostra"
      protocolIcon="/logos/nostra.svg"
      ltv={75}
      maxLtv={90}
      suppliedPositions={suppliedPositions}
      borrowedPositions={borrowedPositions}
      forceShowAll={!connectedAddress}
      networkType="starknet"
      disableMoveSupply
    />
  );
};

export const NostraProtocolView: FC = () => {
  const { address: connectedAddress } = useAccount();

  return (
    <NostraTokensProvider>
      <NostraProtocolViewContent connectedAddress={connectedAddress} />
    </NostraTokensProvider>
  );
};

export default NostraProtocolView;

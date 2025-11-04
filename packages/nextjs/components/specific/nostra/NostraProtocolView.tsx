import { FC } from "react";

import { ProtocolView } from "../../ProtocolView";
import { useAccount } from "~~/hooks/useAccount";
import { useNostraLendingPositions } from "~~/hooks/useNostraLendingPositions";

export const NostraProtocolView: FC = () => {
  const { viewingAddress, isViewingOtherAddress } = useAccount();
  const { suppliedPositions, borrowedPositions } = useNostraLendingPositions();

  return (
    <ProtocolView
      protocolName="Nostra"
      protocolIcon="/logos/nostra.svg"
      ltv={75}
      maxLtv={90}
      suppliedPositions={suppliedPositions}
      borrowedPositions={borrowedPositions}
      forceShowAll={!viewingAddress}
      networkType="starknet"
      disableMoveSupply
      readOnly={isViewingOtherAddress}
    />
  );
};

export default NostraProtocolView;
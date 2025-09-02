import { FC, useState } from "react";
import { ProtocolView } from "../../ProtocolView";
import useNostraProtocolData from "./useNostraProtocolData";

export const NostraProtocolView: FC = () => {
  const { suppliedPositions, borrowedPositions } = useNostraProtocolData();
  // State to track if we should force showing all assets when wallet is not connected
  const [forceShowAll] = useState(false);

  return (
    <ProtocolView
      protocolName="Nostra"
      protocolIcon="/logos/nostra.svg"
      ltv={75}
      maxLtv={90}
      suppliedPositions={suppliedPositions}
      borrowedPositions={borrowedPositions}
      forceShowAll={forceShowAll}
      networkType="starknet"
    />
  );
};

export default NostraProtocolView;

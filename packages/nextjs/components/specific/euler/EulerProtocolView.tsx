import { FC } from "react";
import { ProtocolView } from "../../ProtocolView";
import { AaveLike } from "../aave/AaveLike";

export const EulerProtocolView: FC<{ chainId?: number; enabledFeatures?: { swap?: boolean; move?: boolean } }> = ({
  chainId,
  enabledFeatures,
}) => {
  return (
    <AaveLike chainId={chainId} contractName="EulerGatewayView">
      {({ suppliedPositions, borrowedPositions, forceShowAll }) => (
        <ProtocolView
          protocolName="Euler"
          protocolIcon="/logos/euler.svg"
          enabledFeatures={enabledFeatures}
          ltv={0}
          maxLtv={0}
          suppliedPositions={suppliedPositions}
          borrowedPositions={borrowedPositions}
          forceShowAll={forceShowAll}
          networkType="evm"
          chainId={chainId}
        />
      )}
    </AaveLike>
  );
};

export default EulerProtocolView;

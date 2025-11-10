import { FC } from "react";
import { ProtocolView } from "../../ProtocolView";
import { AaveLike } from "../aave/AaveLike";

export const ZeroLendProtocolView: FC<{ chainId?: number; enabledFeatures?: { swap?: boolean; move?: boolean } }> = ({ chainId, enabledFeatures }) => {
  return (
    <AaveLike chainId={chainId} contractName="ZeroLendGatewayView">
      {({ suppliedPositions, borrowedPositions, forceShowAll }) => (
        <ProtocolView
          protocolName="ZeroLend"
          protocolIcon="/logos/zerolend.svg"
          enabledFeatures={enabledFeatures}
          ltv={75}
          maxLtv={90}
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

export default ZeroLendProtocolView;


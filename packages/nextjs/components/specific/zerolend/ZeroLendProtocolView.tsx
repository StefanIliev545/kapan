import { FC } from "react";
import { AaveForkProtocolView, AaveForkProtocolConfig } from "../common/AaveForkProtocolView";

/**
 * Protocol configuration for ZeroLend.
 * ZeroLend is an Aave V3 fork, so it uses the shared AaveForkProtocolView.
 */
const ZEROLEND_CONFIG: AaveForkProtocolConfig = {
  protocolName: "ZeroLend",
  protocolIcon: "/logos/zerolend.svg",
  viewContractName: "ZeroLendGatewayView",
  writeContractName: "ZeroLendGatewayWrite",
};

/**
 * ZeroLendProtocolView Component
 *
 * Displays ZeroLend lending positions using the shared AaveForkProtocolView.
 * Features include E-Mode support, risk parameters, and position management.
 */
export const ZeroLendProtocolView: FC<{ chainId?: number; enabledFeatures?: { swap?: boolean; move?: boolean } }> = ({ chainId, enabledFeatures }) => {
  return (
    <AaveForkProtocolView
      chainId={chainId}
      enabledFeatures={enabledFeatures}
      config={ZEROLEND_CONFIG}
    />
  );
};

export default ZeroLendProtocolView;

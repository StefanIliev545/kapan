import { FC } from "react";
import { AaveForkProtocolView, AaveForkProtocolConfig } from "../common/AaveForkProtocolView";

/**
 * Protocol configuration for Aave V3.
 * Uses the shared AaveForkProtocolView with Aave-specific settings.
 */
const AAVE_CONFIG: AaveForkProtocolConfig = {
  protocolName: "Aave V3",
  protocolIcon: "/logos/aave.svg",
  viewContractName: "AaveGatewayView",
  writeContractName: "AaveGatewayWrite",
};

/**
 * AaveProtocolView Component
 *
 * Displays Aave V3 lending positions using the shared AaveForkProtocolView.
 * Features include E-Mode support, risk parameters, and position management.
 */
export const AaveProtocolView: FC<{ chainId?: number; enabledFeatures?: { swap?: boolean; move?: boolean } }> = ({ chainId, enabledFeatures }) => {
  return (
    <AaveForkProtocolView
      chainId={chainId}
      enabledFeatures={enabledFeatures}
      config={AAVE_CONFIG}
    />
  );
};

export default AaveProtocolView;

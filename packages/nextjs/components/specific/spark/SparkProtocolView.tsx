import { FC } from "react";
import { AaveForkProtocolView, AaveForkProtocolConfig } from "../common/AaveForkProtocolView";

/**
 * Protocol configuration for Spark.
 * Spark is an Aave V3 fork, so it uses the shared AaveForkProtocolView.
 */
const SPARK_CONFIG: AaveForkProtocolConfig = {
  protocolName: "Spark",
  protocolIcon: "/logos/spark.svg",
  protocolUrl: "https://app.spark.fi",
  viewContractName: "SparkGatewayView",
  writeContractName: "SparkGatewayWrite",
};

/**
 * SparkProtocolView Component
 *
 * Displays Spark lending positions using the shared AaveForkProtocolView.
 * Features include E-Mode support, risk parameters, and position management.
 */
export const SparkProtocolView: FC<{ chainId?: number; enabledFeatures?: { swap?: boolean; move?: boolean } }> = ({ chainId, enabledFeatures }) => {
  return (
    <AaveForkProtocolView
      chainId={chainId}
      enabledFeatures={enabledFeatures}
      config={SPARK_CONFIG}
    />
  );
};

export default SparkProtocolView;

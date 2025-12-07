import { FC, useMemo } from "react";
import { ProtocolView } from "../../ProtocolView";
import { AaveLike } from "../aave/AaveLike";
import { useRiskParams } from "~~/hooks/useRiskParams";
import { useAccount } from "wagmi";
import { useScaffoldContract } from "~~/hooks/scaffold-eth";
import { Address } from "viem";

export const ZeroLendProtocolView: FC<{ chainId?: number; enabledFeatures?: { swap?: boolean; move?: boolean } }> = ({ chainId, enabledFeatures }) => {
  const { address } = useAccount();
  // Type assertion needed because ZeroLendGatewayView may not be in ContractName yet
  const { data: gateway } = useScaffoldContract({ contractName: "ZeroLendGatewayView" as any, chainId: chainId as any });

  const gatewayAddress = gateway?.address as Address | undefined;

  const { ltvBps, lltvBps } = useRiskParams({
    gateway: gatewayAddress,
    gatewayAbi: gateway?.abi,
    marketOrToken: gatewayAddress,
    user: address as Address | undefined,
  });

  const lltvValue = useMemo(() => (lltvBps > 0n ? lltvBps : ltvBps), [lltvBps, ltvBps]);

  return (
    <AaveLike chainId={chainId} contractName="ZeroLendGatewayView">
      {({ suppliedPositions, borrowedPositions, forceShowAll }) => (
        <ProtocolView
          protocolName="ZeroLend"
          protocolIcon="/logos/zerolend.svg"
          enabledFeatures={enabledFeatures}
          ltvBps={ltvBps}
          lltvBps={lltvValue}
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

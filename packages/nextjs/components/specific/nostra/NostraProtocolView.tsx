import { FC, useEffect } from "react";

import { ProtocolView } from "../../ProtocolView";
import { useAccount } from "~~/hooks/useAccount";
import { useNostraLendingPositions } from "~~/hooks/useNostraLendingPositions";
import { useGlobalState } from "~~/services/store/store";

export const NostraProtocolView: FC = () => {
  const { viewingAddress, isViewingOtherAddress } = useAccount();
  const { suppliedPositions, borrowedPositions, isLoading, hasLoadedOnce } = useNostraLendingPositions();
  const setProtocolTotals = useGlobalState(state => state.setProtocolTotals);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const totalSupplied = suppliedPositions.reduce((sum, position) => sum + position.balance, 0);
    const totalBorrowed = borrowedPositions.reduce(
      (sum, position) => sum + (position.balance < 0 ? -position.balance : 0),
      0,
    );

    setProtocolTotals("Nostra", totalSupplied, totalBorrowed);
  }, [borrowedPositions, isLoading, setProtocolTotals, suppliedPositions]);

  return (
    <ProtocolView
      protocolName="Nostra"
      protocolIcon="/logos/nostra.svg"
      suppliedPositions={suppliedPositions}
      borrowedPositions={borrowedPositions}
      forceShowAll={!viewingAddress}
      networkType="starknet"
      disableMoveSupply
      disableLoop
      readOnly={isViewingOtherAddress}
      autoExpandOnPositions
      hasLoadedOnce={hasLoadedOnce}
    />
  );
};

export default NostraProtocolView;
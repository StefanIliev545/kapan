import { useEffect, useState } from "react";

/**
 * Determines whether protocol views should display all assets when no wallet is connected.
 * This avoids using timeouts that can cause layout shifts on mobile devices.
 *
 * @param isConnected - Wallet connection status
 * @returns Boolean indicating if the view should force showing all assets
 */
export const useForceShowAll = (isConnected?: boolean): boolean => {
  const [forceShowAll, setForceShowAll] = useState(!isConnected);

  useEffect(() => {
    setForceShowAll(!isConnected);
  }, [isConnected]);

  return forceShowAll;
};

export default useForceShowAll;

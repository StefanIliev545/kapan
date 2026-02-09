import React, { FC, memo } from "react";
import { useEulerState } from "../RefinanceContext";

export type EulerVaultSectionProps = {
  /** Whether Euler protocol is selected */
  isEulerSelected?: boolean;
  /** Euler sub-account index (0 = main account, 1-255 = sub-accounts) */
  eulerSubAccountIndex?: number;
  /** Whether this will create a new Euler sub-account vs adding to existing */
  isNewEulerSubAccount?: boolean;
};

/**
 * EulerVaultSection displays Euler-specific sub-account information
 * when Euler is the selected destination protocol.
 *
 * Can be used in two ways:
 * 1. With props (standalone) - pass all props directly
 * 2. With context - omit props and it will use RefinanceContext
 */
export const EulerVaultSection: FC<Partial<EulerVaultSectionProps>> = memo((props) => {
  // Check if we have any props provided (for standalone usage)
  const hasProps = props.isEulerSelected !== undefined ||
    props.eulerSubAccountIndex !== undefined ||
    props.isNewEulerSubAccount !== undefined;

  let eulerState: {
    isSelected?: boolean;
    subAccountIndex?: number;
    isNewSubAccount?: boolean;
  };

  if (hasProps) {
    // Use props directly
    eulerState = {
      isSelected: props.isEulerSelected,
      subAccountIndex: props.eulerSubAccountIndex,
      isNewSubAccount: props.isNewEulerSubAccount,
    };
  } else {
    // Use context - this will throw if not in provider
    // eslint-disable-next-line react-hooks/rules-of-hooks
    eulerState = useEulerState();
  }

  const { isSelected, subAccountIndex, isNewSubAccount } = eulerState;

  // Only render when Euler is selected and we have sub-account info
  if (!isSelected || subAccountIndex === undefined) {
    return null;
  }

  return (
    <div className="bg-base-200 mt-2 rounded-lg px-3 py-2 text-sm">
      <span className="text-base-content/70">
        {isNewSubAccount ? (
          <>
            Will create <span className="text-warning font-medium">new position</span>
            {subAccountIndex > 0 && (
              <span className="text-base-content/50"> (sub-account #{subAccountIndex})</span>
            )}
          </>
        ) : (
          <>
            Will add to <span className="text-success font-medium">existing position</span>
            {subAccountIndex > 0 && (
              <span className="text-base-content/50"> (sub-account #{subAccountIndex})</span>
            )}
          </>
        )}
      </span>
    </div>
  );
});

EulerVaultSection.displayName = "EulerVaultSection";

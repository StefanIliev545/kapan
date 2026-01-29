import React, { FC, memo, useCallback, useMemo } from "react";
import { CheckIcon } from "@heroicons/react/24/outline";
import { SegmentedActionBar } from "../../../common/SegmentedActionBar";
import { ButtonLoading } from "../../../common/Loading";
import { useActionsState } from "../RefinanceContext";

export type ActionsFooterProps = {
  /** Whether to show batching option (EVM only) */
  showBatchingOption: boolean;
  /** Whether batching is preferred */
  preferBatching: boolean;
  /** Callback to toggle batching preference */
  setPreferBatching?: React.Dispatch<React.SetStateAction<boolean>>;
  /** Whether to revoke permissions after execution */
  revokePermissions?: boolean;
  /** Callback to toggle revoke permissions */
  setRevokePermissions?: React.Dispatch<React.SetStateAction<boolean>>;
  /** Whether user has active ADL orders (disables revoke permissions) */
  hasActiveADLOrders?: boolean;
  /** Whether the action button is disabled */
  isActionDisabled: boolean;
  /** Whether submission is in progress */
  isSubmitting: boolean;
  /** Callback to execute the refinance */
  handleExecuteMove: () => void;
};

/**
 * ActionsFooter displays the batching/revoke options and the refinance action button.
 *
 * Can be used in two ways:
 * 1. With props (standalone) - pass all props directly
 * 2. With context - omit props and it will use RefinanceContext
 */
export const ActionsFooter: FC<Partial<ActionsFooterProps>> = memo((props) => {
  // Check if we have all required props
  const hasAllProps = props.showBatchingOption !== undefined &&
    props.preferBatching !== undefined &&
    props.isActionDisabled !== undefined &&
    props.isSubmitting !== undefined &&
    props.handleExecuteMove !== undefined;

  let actionsState: {
    isDisabled: boolean;
    isSubmitting: boolean;
    handleExecuteMove: () => void;
    showBatchingOption: boolean;
    preferBatching: boolean;
    setPreferBatching?: React.Dispatch<React.SetStateAction<boolean>>;
    revokePermissions?: boolean;
    setRevokePermissions?: React.Dispatch<React.SetStateAction<boolean>>;
    hasActiveADLOrders?: boolean;
  };

  if (hasAllProps) {
    // Use props directly
    actionsState = {
      isDisabled: props.isActionDisabled!,
      isSubmitting: props.isSubmitting!,
      handleExecuteMove: props.handleExecuteMove!,
      showBatchingOption: props.showBatchingOption!,
      preferBatching: props.preferBatching!,
      setPreferBatching: props.setPreferBatching,
      revokePermissions: props.revokePermissions,
      setRevokePermissions: props.setRevokePermissions,
      hasActiveADLOrders: props.hasActiveADLOrders,
    };
  } else {
    // Use context - this will throw if not in provider
    // eslint-disable-next-line react-hooks/rules-of-hooks
    actionsState = useActionsState();
  }

  const {
    isDisabled,
    isSubmitting,
    handleExecuteMove,
    showBatchingOption,
    preferBatching,
    setPreferBatching,
    revokePermissions,
    setRevokePermissions,
    hasActiveADLOrders,
  } = actionsState;

  // Batching/revoke handlers
  const handleToggleBatching = useCallback(() => {
    setPreferBatching?.(prev => !prev);
  }, [setPreferBatching]);

  const handleToggleRevoke = useCallback(() => {
    setRevokePermissions?.(prev => !prev);
  }, [setRevokePermissions]);

  // Segmented action bar actions
  const segmentedActions = useMemo(
    () => [
      {
        key: "refinance",
        label: isSubmitting ? "Processing..." : "Refinance",
        icon: isSubmitting ? <ButtonLoading size="xs" /> : undefined,
        onClick: handleExecuteMove,
        disabled: isDisabled || isSubmitting,
        variant: "ghost" as const,
      },
    ],
    [isSubmitting, handleExecuteMove, isDisabled],
  );

  return (
    <div className="flex items-center justify-between pt-2">
      {showBatchingOption && setPreferBatching && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={handleToggleBatching}
            className={`inline-flex cursor-pointer items-center gap-1 text-xs hover:opacity-80 ${preferBatching ? "text-success" : "text-base-content/60"
              }`}
          >
            <CheckIcon className={`size-4 ${preferBatching ? "" : "opacity-40"}`} />
            Batch transactions
          </button>
          {setRevokePermissions && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleRevoke}
                disabled={hasActiveADLOrders}
                className={`inline-flex cursor-pointer items-center gap-1 text-xs hover:opacity-80 ${
                  hasActiveADLOrders
                    ? "text-base-content/40 cursor-not-allowed"
                    : revokePermissions
                      ? "text-success"
                      : "text-base-content/60"
                }`}
                title={hasActiveADLOrders ? "Cannot revoke permissions while ADL protection is active" : undefined}
              >
                <CheckIcon className={`size-4 ${revokePermissions && !hasActiveADLOrders ? "" : "opacity-40"}`} />
                Revoke permissions
              </button>
              {hasActiveADLOrders && (
                <span className="text-warning text-[10px]" title="ADL protection requires router permissions">
                  (ADL active)
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {!showBatchingOption && <div />}

      <div className="ml-4 flex-1">
        <SegmentedActionBar
          className="w-full"
          autoCompact
          actions={segmentedActions}
        />
      </div>
    </div>
  );
});

ActionsFooter.displayName = "ActionsFooter";

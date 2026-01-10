import { FC } from "react";
import { createCheckboxHandler } from "~~/utils/handlers";

interface BatchingPreferenceProps {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  isLoaded: boolean;
}

export const BatchingPreference: FC<BatchingPreferenceProps> = ({ enabled, setEnabled, isLoaded }) => {
  if (!isLoaded) {
    return null;
  }

  return (
    <div className="pb-1 pt-2">
      <label className="label cursor-pointer justify-start gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={createCheckboxHandler(setEnabled)}
          className="checkbox checkbox-sm"
        />
        <span className="label-text text-xs">Batch Transactions with Smart Account</span>
      </label>
    </div>
  );
};

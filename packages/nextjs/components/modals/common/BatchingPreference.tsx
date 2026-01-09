import { FC } from "react";

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
    <div className="pt-2 pb-1">
      <label className="label cursor-pointer gap-2 justify-start">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="checkbox checkbox-sm"
        />
        <span className="label-text text-xs">Batch Transactions with Smart Account</span>
      </label>
    </div>
  );
};

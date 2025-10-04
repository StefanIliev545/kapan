import { FC } from "react";

interface VesuVersionToggleProps {
  selectedVersion: "v1" | "v2";
  onVersionChange: (version: "v1" | "v2") => void;
}

export const VesuVersionToggle: FC<VesuVersionToggleProps> = ({
  selectedVersion,
  onVersionChange,
}) => {
  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm font-medium text-base-content/60">Version:</span>
      <div className="flex bg-base-200 rounded-lg p-1">
        <button
          className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
            selectedVersion === "v1"
              ? "bg-primary text-primary-content"
              : "text-base-content/60 hover:text-base-content"
          }`}
          onClick={() => onVersionChange("v1")}
        >
          V1
        </button>
        <button
          className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
            selectedVersion === "v2"
              ? "bg-primary text-primary-content"
              : "text-base-content/60 hover:text-base-content"
          }`}
          onClick={() => onVersionChange("v2")}
        >
          V2
        </button>
      </div>
    </div>
  );
};

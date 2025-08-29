import { FC } from "react";
import { FiInfo } from "react-icons/fi";

interface InfoDropdownProps {
  name: string;
  tokenAddress: string;
  protocolName: string;
  positionType: string;
  children?: React.ReactNode;
}

export const InfoDropdown: FC<InfoDropdownProps> = ({
  name,
  tokenAddress,
  protocolName,
  positionType,
  children,
}) => (
  <div className="dropdown dropdown-end dropdown-bottom flex-shrink-0 ml-1" onClick={e => e.stopPropagation()}>
    <div tabIndex={0} role="button" className="cursor-pointer flex items-center justify-center h-[1.125em]">
      <FiInfo className="w-4 h-4 text-base-content/50 hover:text-base-content/80 transition-colors" aria-hidden="true" />
    </div>
    <div
      tabIndex={0}
      className="dropdown-content z-[1] card card-compact p-2 shadow bg-base-100 w-64 max-w-[90vw]"
      style={{
        right: "auto",
        transform: "translateX(-50%)",
        left: "50%",
        borderRadius: "4px",
      }}
    >
      <div className="card-body p-3">
        <h3 className="card-title text-sm">{name} Details</h3>
        <div className="text-xs space-y-1">
          <p className="text-base-content/70">Contract Address:</p>
          <p className="font-mono break-all">{tokenAddress}</p>
          <p className="text-base-content/70">Protocol:</p>
          <p>{protocolName}</p>
          <p className="text-base-content/70">Type:</p>
          <p className="capitalize">{positionType}</p>
          {children}
        </div>
      </div>
    </div>
  </div>
);

export default InfoDropdown;

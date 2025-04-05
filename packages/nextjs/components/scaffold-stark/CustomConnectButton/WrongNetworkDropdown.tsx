import { NetworkOptions } from "./NetworkOptions";
import { useDisconnect } from "@starknet-react/core";
import { ArrowLeftEndOnRectangleIcon, ChevronDownIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

export const WrongNetworkDropdown = () => {
  const { disconnect } = useDisconnect();

  return (
    <div className="dropdown dropdown-end flex-1">
      <label tabIndex={0} className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity duration-200 py-1 text-error">
        <ExclamationTriangleIcon className="h-4 w-4" />
        <span className="text-sm font-medium">Wrong Network</span>
        <ChevronDownIcon className="h-4 w-4 text-base-content/70" />
      </label>

      <ul
        tabIndex={0}
        className="dropdown-content menu p-2 mt-1 shadow-center shadow-accent bg-base-200 rounded-box gap-1"
      >
        {/* TODO: reinstate if needed */}
        {/* <NetworkOptions /> */}
        <li>
          <button
            className="menu-item text-error btn-sm !rounded-xl flex gap-3 py-3"
            type="button"
            onClick={() => disconnect()}
          >
            <ArrowLeftEndOnRectangleIcon className="h-6 w-4 ml-2 sm:ml-0" />
            <span>Disconnect</span>
          </button>
        </li>
      </ul>
    </div>
  );
};

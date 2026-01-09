import { NetworkOptions } from "./NetworkOptions";
import { useDisconnect } from "wagmi";
import { ArrowLeftOnRectangleIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

export const WrongNetworkDropdown = () => {
  const { disconnect } = useDisconnect();

  return (
    <div className="dropdown dropdown-end mr-2">
      <label tabIndex={0} className="btn btn-error btn-sm dropdown-toggle gap-1">
        <span>Wrong network</span>
        <ChevronDownIcon className="ml-2 h-6 w-4 sm:ml-0" />
      </label>
      <ul
        tabIndex={0}
        className="dropdown-content menu shadow-center shadow-accent bg-base-200 rounded-box mt-1 gap-1 p-2"
      >
        <NetworkOptions />
        <li>
          <button
            className="menu-item text-error btn-sm flex gap-3 !rounded-xl py-3"
            type="button"
            onClick={() => disconnect()}
          >
            <ArrowLeftOnRectangleIcon className="ml-2 h-6 w-4 sm:ml-0" />
            <span>Disconnect</span>
          </button>
        </li>
      </ul>
    </div>
  );
};

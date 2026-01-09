import { useDisconnect } from "@starknet-react/core";
import { ArrowLeftEndOnRectangleIcon, ChevronDownIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

export const WrongNetworkDropdown = () => {
  const { disconnect } = useDisconnect();

  return (
    <div className="dropdown dropdown-end flex-1">
      <label tabIndex={0} className="text-error flex cursor-pointer items-center gap-2 py-1 transition-opacity duration-200 hover:opacity-80">
        <ExclamationTriangleIcon className="size-4" />
        <span className="text-sm font-medium">Wrong Network</span>
        <ChevronDownIcon className="text-base-content/70 size-4" />
      </label>

      <ul
        tabIndex={0}
        className="dropdown-content menu shadow-center shadow-accent bg-base-200 rounded-box mt-1 gap-1 p-2"
      >
        {/* TODO: reinstate if needed */}
        {/* <NetworkOptions /> */}
        <li>
          <button
            className="menu-item text-error btn-sm flex gap-3 !rounded-xl py-3"
            type="button"
            onClick={() => disconnect()}
          >
            <ArrowLeftEndOnRectangleIcon className="ml-2 h-6 w-4 sm:ml-0" />
            <span>Disconnect</span>
          </button>
        </li>
      </ul>
    </div>
  );
};

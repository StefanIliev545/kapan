import { FC, useCallback } from "react";
import Image from "next/image";
import { type FlashLoanProviderOption } from "~~/utils/flashLoan";

/**
 * Displays a flash loan provider's icon and name.
 */
export interface ProviderDisplayProps {
  provider: FlashLoanProviderOption;
  className?: string;
  nameClassName?: string;
}

export const ProviderDisplay: FC<ProviderDisplayProps> = ({
  provider,
  className = "flex items-center gap-3",
  nameClassName = "truncate text-lg font-semibold",
}) => (
  <div className={className}>
    <Image
      src={provider.icon}
      alt={provider.name}
      width={32}
      height={32}
      className="min-w-[32px] rounded-full"
    />
    <span className={nameClassName}>{provider.name}</span>
  </div>
);

/**
 * Dropdown item for a flash loan provider.
 */
export interface ProviderDropdownItemProps {
  provider: FlashLoanProviderOption;
  onClick: () => void;
}

export const ProviderDropdownItem: FC<ProviderDropdownItemProps> = ({ provider, onClick }) => (
  <li key={provider.name}>
    <button className="flex items-center gap-3 py-2" onClick={onClick}>
      <Image
        src={provider.icon}
        alt={provider.name}
        width={32}
        height={32}
        className="min-w-[32px] rounded-full"
      />
      <span className="truncate text-lg">{provider.name}</span>
    </button>
  </li>
);

/**
 * Chevron down icon for dropdown.
 */
const ChevronDownIcon: FC = () => (
  <svg className="size-4 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
  </svg>
);

/**
 * Complete flash loan provider selector component.
 * Shows a static display when only one provider is available,
 * or a dropdown when multiple providers are available.
 */
export interface FlashLoanProviderSelectorProps {
  providers: FlashLoanProviderOption[];
  selectedProvider: FlashLoanProviderOption | null;
  onSelectProvider: (provider: FlashLoanProviderOption) => void;
  label?: string;
}

export const FlashLoanProviderSelector: FC<FlashLoanProviderSelectorProps> = ({
  providers,
  selectedProvider,
  onSelectProvider,
  label = "Flash Loan Provider",
}) => {
  // Factory for provider click handlers
  const createProviderClickHandler = useCallback(
    (provider: FlashLoanProviderOption) => () => onSelectProvider(provider),
    [onSelectProvider],
  );

  if (providers.length === 0) return null;

  return (
    <div>
      <label className="text-base-content/80 text-sm font-medium">{label}</label>
      {providers.length === 1 ? (
        // Show as static display if only one provider available
        <div className="border-base-300 flex h-14 items-center gap-3 border-b-2 px-1">
          {selectedProvider && <ProviderDisplay provider={selectedProvider} />}
        </div>
      ) : (
        // Show dropdown if multiple providers available
        <div className="dropdown w-full">
          <div
            tabIndex={0}
            className="border-base-300 flex h-14 cursor-pointer items-center justify-between border-b-2 px-1 py-3"
          >
            <div className="flex w-[calc(100%-32px)] items-center gap-3 overflow-hidden">
              {selectedProvider && <ProviderDisplay provider={selectedProvider} />}
            </div>
            <ChevronDownIcon />
          </div>
          <ul
            tabIndex={0}
            className="dropdown-content menu bg-base-100 dropdown-bottom z-50 mt-1 w-full rounded-lg p-2 shadow-lg"
          >
            {providers.map(provider => (
              <ProviderDropdownItem
                key={provider.name}
                provider={provider}
                onClick={createProviderClickHandler(provider)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

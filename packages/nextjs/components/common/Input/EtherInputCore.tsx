"use client";

import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { CommonInputProps, SIGNED_NUMBER_REGEX } from "./utils";
import {
  MAX_DECIMALS_USD,
  etherValueToDisplayValue,
  displayValueToEtherValue,
} from "./etherInputUtils";

export type EtherInputStyleConfig = {
  prefixClass: string;
  buttonClass: string;
};

export type EtherInputCoreProps = CommonInputProps & {
  usdMode?: boolean;
  /**
   * The current native currency price (ETH, STRK, etc.)
   */
  nativeCurrencyPrice: number;
  /**
   * Whether the price is currently being fetched (for tooltip display)
   */
  isPriceFetching?: boolean;
  /**
   * The InputBase component to render (network-specific styled version)
   */
  InputBaseComponent: React.ComponentType<{
    name?: string;
    value: string;
    placeholder?: string;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onChange: (value: string) => void;
    disabled?: boolean;
    prefix?: ReactNode;
    suffix?: ReactNode;
  }>;
  /**
   * Style configuration for network-specific styling
   */
  styleConfig?: EtherInputStyleConfig;
};

const defaultStyleConfig: EtherInputStyleConfig = {
  prefixClass: "text-accent -mr-2 self-center pl-4",
  buttonClass: "btn btn-primary h-[2.2rem] min-h-[2.2rem]",
};

/**
 * Core EtherInput component with shared logic for ETH/token amount input with USD conversion.
 * This is network-agnostic and can be used by both EVM and Starknet implementations.
 *
 * onChange will always be called with the value in the native currency (ETH, STRK, etc.)
 */
export const EtherInputCore = ({
  value,
  name,
  placeholder,
  onChange,
  disabled,
  usdMode,
  nativeCurrencyPrice,
  isPriceFetching = false,
  InputBaseComponent,
  styleConfig = defaultStyleConfig,
}: EtherInputCoreProps) => {
  const [transitoryDisplayValue, setTransitoryDisplayValue] = useState<string>();
  const isPriceFetched = nativeCurrencyPrice > 0;

  // Internal USD mode state, synced with prop and price availability
  const [internalUsdMode, setInternalUsdMode] = useState(
    isPriceFetched ? Boolean(usdMode) : false,
  );

  // Sync internal USD mode when prop or price changes
  useEffect(() => {
    setInternalUsdMode(isPriceFetched ? Boolean(usdMode) : false);
  }, [usdMode, isPriceFetched]);

  // The displayValue is derived from the ether value that is controlled outside of the component
  // In usdMode, it is converted to its usd value, in regular mode it is unaltered
  const displayValue = useMemo(() => {
    const newDisplayValue = etherValueToDisplayValue(
      internalUsdMode,
      value,
      nativeCurrencyPrice,
    );
    if (
      transitoryDisplayValue &&
      parseFloat(newDisplayValue) === parseFloat(transitoryDisplayValue)
    ) {
      return transitoryDisplayValue;
    }
    return newDisplayValue;
  }, [nativeCurrencyPrice, transitoryDisplayValue, internalUsdMode, value]);

  // Clear transitory display value when the computed value changes
  useEffect(() => {
    const newDisplayValue = etherValueToDisplayValue(
      internalUsdMode,
      value,
      nativeCurrencyPrice,
    );
    if (
      transitoryDisplayValue &&
      parseFloat(newDisplayValue) !== parseFloat(transitoryDisplayValue)
    ) {
      setTransitoryDisplayValue(undefined);
    }
  }, [nativeCurrencyPrice, transitoryDisplayValue, internalUsdMode, value]);

  const handleChangeNumber = useCallback(
    (newValue: string) => {
      if (newValue && !SIGNED_NUMBER_REGEX.test(newValue)) {
        return;
      }

      // Following condition is a fix to prevent usdMode from experiencing different display values
      // than what the user entered. This can happen due to floating point rounding errors that are
      // introduced in the back and forth conversion
      if (internalUsdMode) {
        const decimals = newValue.split(".")[1];
        if (decimals && decimals.length > MAX_DECIMALS_USD) {
          return;
        }
      }

      // Since the display value is a derived state (calculated from the ether value), usdMode would
      // not allow introducing a decimal point. This condition handles a transitory state for a
      // display value with a trailing decimal sign
      if (newValue.endsWith(".") || newValue.endsWith(".0")) {
        setTransitoryDisplayValue(newValue);
      } else {
        setTransitoryDisplayValue(undefined);
      }

      const newEthValue = displayValueToEtherValue(
        internalUsdMode,
        newValue,
        nativeCurrencyPrice,
      );
      onChange(newEthValue);
    },
    [internalUsdMode, nativeCurrencyPrice, onChange],
  );

  const toggleMode = useCallback(() => {
    if (isPriceFetched) {
      setInternalUsdMode(prev => !prev);
    }
  }, [isPriceFetched]);

  const tooltipMessage = isPriceFetching ? "Fetching price" : "Unable to fetch price";

  // Memoize prefix JSX to avoid re-creating on each render
  const prefixElement = useMemo(
    () => (
      <span className={styleConfig.prefixClass}>
        {internalUsdMode ? "$" : "\u039E"}
      </span>
    ),
    [styleConfig.prefixClass, internalUsdMode],
  );

  // Memoize suffix JSX to avoid re-creating on each render
  const suffixElement = useMemo(
    () => (
      <div
        className={`${
          isPriceFetched
            ? ""
            : "tooltip tooltip-secondary before:left-auto before:right-[-10px] before:transform-none before:content-[attr(data-tip)]"
        }`}
        data-tip={tooltipMessage}
      >
        <button
          className={styleConfig.buttonClass}
          onClick={toggleMode}
          disabled={!internalUsdMode && !isPriceFetched}
          type="button"
        >
          <ArrowsRightLeftIcon className="size-3 cursor-pointer" aria-hidden="true" />
        </button>
      </div>
    ),
    [isPriceFetched, tooltipMessage, styleConfig.buttonClass, toggleMode, internalUsdMode],
  );

  return (
    <InputBaseComponent
      name={name}
      value={displayValue}
      placeholder={placeholder}
      onChange={handleChangeNumber}
      disabled={disabled}
      prefix={prefixElement}
      suffix={suffixElement}
    />
  );
};

"use client";

import { ChangeEvent, FocusEvent, ReactNode, useCallback, useEffect, useRef } from "react";
import { CommonInputProps } from "./utils";

export type InputBaseStyleConfig = {
  container: string;
  input: string;
};

type InputBaseProps<T> = CommonInputProps<T> & {
  error?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
  reFocus?: boolean;
  /**
   * Style configuration for the input component.
   * Allows customization for different networks (EVM vs Starknet).
   */
  styleConfig?: InputBaseStyleConfig;
};

const defaultStyleConfig: InputBaseStyleConfig = {
  container: "border-base-300 bg-base-200 text-accent flex rounded-full border-2",
  input:
    "input input-ghost placeholder:text-accent/70 text-base-content/70 focus:text-base-content/70 h-[2.2rem] min-h-[2.2rem] w-full border px-4 font-medium focus-within:border-transparent focus:bg-transparent focus:outline-none",
};

/**
 * A network-agnostic base input component that can be styled differently
 * for EVM and Starknet contexts.
 */
export const InputBase = <T extends { toString: () => string } | undefined = string>({
  name,
  value,
  onChange,
  placeholder,
  error,
  disabled,
  prefix,
  suffix,
  reFocus,
  styleConfig = defaultStyleConfig,
}: InputBaseProps<T>) => {
  const inputRef = useRef<HTMLInputElement>(null);

  let modifier = "";
  if (error) {
    modifier = "border-error";
  } else if (disabled) {
    modifier = "border-disabled bg-base-300";
  }

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value as unknown as T);
    },
    [onChange],
  );

  // Runs only when reFocus prop is passed, useful for setting the cursor
  // at the end of the input. Example AddressInput
  const onFocus = useCallback((e: FocusEvent<HTMLInputElement, Element>) => {
    if (reFocus !== undefined) {
      e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length);
    }
  }, [reFocus]);

  useEffect(() => {
    if (reFocus !== undefined && reFocus === true) inputRef.current?.focus();
  }, [reFocus]);

  return (
    <div className={`${styleConfig.container} ${modifier}`}>
      {prefix}
      <input
        className={styleConfig.input}
        placeholder={placeholder}
        name={name}
        value={value?.toString() ?? ""}
        onChange={handleChange}
        disabled={disabled}
        autoComplete="off"
        ref={inputRef}
        onFocus={onFocus}
      />
      {suffix}
    </div>
  );
};

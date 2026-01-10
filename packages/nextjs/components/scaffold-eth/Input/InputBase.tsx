"use client";

import { ReactNode } from "react";
import {
  InputBase as SharedInputBase,
  InputBaseStyleConfig,
  CommonInputProps,
} from "~~/components/common/Input";

type InputBaseProps<T> = CommonInputProps<T> & {
  error?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
  reFocus?: boolean;
};

/**
 * EVM-styled InputBase component.
 * Uses the shared InputBase with EVM-specific styling.
 */
const evmStyleConfig: InputBaseStyleConfig = {
  container: "border-base-300 bg-base-200 text-accent flex rounded-full border-2",
  input:
    "input input-ghost placeholder:text-accent/70 text-base-content/70 focus:text-base-content/70 h-[2.2rem] min-h-[2.2rem] w-full border px-4 font-medium focus-within:border-transparent focus:bg-transparent focus:outline-none",
};

export const InputBase = <T extends { toString: () => string } | undefined = string>(
  props: InputBaseProps<T>,
) => {
  return <SharedInputBase {...props} styleConfig={evmStyleConfig} />;
};

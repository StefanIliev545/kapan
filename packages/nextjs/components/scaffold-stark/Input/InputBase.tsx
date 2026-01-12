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
 * Starknet-styled InputBase component.
 * Uses the shared InputBase with Starknet-specific styling.
 */
const starkStyleConfig: InputBaseStyleConfig = {
  container: "bg-input text-accent flex",
  input:
    "input input-ghost text-base-content h-[2.2rem] min-h-[2.2rem] w-full rounded-none border px-4 text-xs placeholder:text-[#9596BF] focus-within:border-transparent focus:bg-transparent focus:outline-none",
};

export const InputBase = <T extends { toString: () => string } | undefined = string>(
  props: InputBaseProps<T>,
) => {
  return <SharedInputBase {...props} styleConfig={starkStyleConfig} />;
};

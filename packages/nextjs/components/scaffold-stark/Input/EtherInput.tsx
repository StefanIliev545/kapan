"use client";

import { InputBase } from "./InputBase";
import {
  CommonInputProps,
  EtherInputCore,
  EtherInputStyleConfig,
} from "~~/components/common/Input";
import { useGlobalState } from "~~/services/store/store";

/**
 * Starknet-styled EtherInput component.
 * Input for ETH amount with USD conversion.
 *
 * onChange will always be called with the value in ETH
 */

const starkStyleConfig: EtherInputStyleConfig = {
  prefixClass: "text-accent mr-2 self-center pl-4",
  buttonClass: "btn btn-primary mt-[.1rem] h-[2rem] min-h-[2rem]",
};

export const EtherInput = ({
  value,
  name,
  placeholder,
  onChange,
  disabled,
  usdMode,
}: CommonInputProps & { usdMode?: boolean }) => {
  const nativeCurrencyPrice = useGlobalState(state => state.nativeCurrencyPrice);

  return (
    <EtherInputCore
      value={value}
      name={name}
      placeholder={placeholder}
      onChange={onChange}
      disabled={disabled}
      usdMode={usdMode}
      nativeCurrencyPrice={nativeCurrencyPrice}
      isPriceFetching={false}
      InputBaseComponent={InputBase}
      styleConfig={starkStyleConfig}
    />
  );
};

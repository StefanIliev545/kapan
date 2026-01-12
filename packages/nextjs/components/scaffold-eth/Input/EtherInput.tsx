"use client";

import { InputBase } from "./InputBase";
import {
  CommonInputProps,
  EtherInputCore,
  EtherInputStyleConfig,
} from "~~/components/common/Input";
import { useGlobalState } from "~~/services/store/store";

/**
 * EVM-styled EtherInput component.
 * Input for ETH amount with USD conversion.
 *
 * onChange will always be called with the value in ETH
 */

const evmStyleConfig: EtherInputStyleConfig = {
  prefixClass: "text-accent -mr-2 self-center pl-4",
  buttonClass: "btn btn-primary h-[2.2rem] min-h-[2.2rem]",
};

export const EtherInput = ({
  value,
  name,
  placeholder,
  onChange,
  disabled,
  usdMode,
}: CommonInputProps & { usdMode?: boolean }) => {
  const nativeCurrencyPrice = useGlobalState(state => state.nativeCurrency.price);
  const isPriceFetching = useGlobalState(state => state.nativeCurrency.isFetching);

  return (
    <EtherInputCore
      value={value}
      name={name}
      placeholder={placeholder}
      onChange={onChange}
      disabled={disabled}
      usdMode={usdMode}
      nativeCurrencyPrice={nativeCurrencyPrice}
      isPriceFetching={isPriceFetching}
      InputBaseComponent={InputBase}
      styleConfig={evmStyleConfig}
    />
  );
};

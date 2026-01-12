import { useCallback, useMemo } from "react";
import { blo } from "blo";
import { useDebounceValue } from "usehooks-ts";
import { CommonInputProps, InputBase } from "~~/components/scaffold-stark";
import { Address } from "@starknet-react/chains";
import { isValidStarknetAddressInput } from "~~/utils/validation";
import Image from "next/image";

/**
 * Address input with ENS name resolution
 */
export const AddressInput = ({
  value,
  name,
  placeholder,
  onChange,
  disabled,
}: CommonInputProps<Address | string>) => {
  // TODO : Add Starkname functionality here with cached profile, check ENS on scaffold-eth
  useDebounceValue(value, 500);

  const handleChange = useCallback(
    (newValue: Address) => {
      const sanitizedValue = newValue.toLowerCase();

      if (sanitizedValue === "0x") {
        onChange("0x0" as Address);
        return;
      }

      // Use shared validation utility for Starknet address input
      if (!isValidStarknetAddressInput(sanitizedValue)) {
        return;
      }

      onChange(newValue);
    },
    [onChange],
  );

  // Memoize suffix JSX to avoid re-creating on each render
  const suffixElement = useMemo(
    () =>
      value ? (
        <Image
          alt=""
          className="!rounded-full"
          src={blo(value as `0x${string}`)}
          width={35}
          height={35}
          unoptimized
        />
      ) : null,
    [value],
  );

  return (
    <InputBase<Address>
      name={name}
      placeholder={placeholder}
      value={value as Address}
      onChange={handleChange}
      disabled={disabled}
      prefix={null}
      suffix={suffixElement}
    />
  );
};

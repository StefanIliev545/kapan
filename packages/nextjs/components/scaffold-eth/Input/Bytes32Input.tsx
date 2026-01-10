import { useCallback, useMemo } from "react";
import { hexToString, isHex, stringToHex } from "viem";
import { CommonInputProps, InputBase } from "~~/components/scaffold-eth";

export const Bytes32Input = ({ value, onChange, name, placeholder, disabled }: CommonInputProps) => {
  const convertStringToBytes32 = useCallback(() => {
    if (!value) {
      return;
    }
    onChange(isHex(value) ? hexToString(value, { size: 32 }) : stringToHex(value, { size: 32 }));
  }, [onChange, value]);

  // Memoize suffix JSX to avoid re-creating on each render
  const suffixElement = useMemo(
    () => (
      <button
        className="text-accent cursor-pointer self-center px-4 text-xl font-semibold"
        onClick={convertStringToBytes32}
        type="button"
      >
        #
      </button>
    ),
    [convertStringToBytes32],
  );

  return (
    <InputBase
      name={name}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
      disabled={disabled}
      suffix={suffixElement}
    />
  );
};

import { useCallback, useMemo } from "react";
import { bytesToString, isHex, toBytes, toHex } from "viem";
import { CommonInputProps, InputBase } from "~~/components/scaffold-eth";

export const BytesInput = ({ value, onChange, name, placeholder, disabled }: CommonInputProps) => {
  const convertStringToBytes = useCallback(() => {
    onChange(isHex(value) ? bytesToString(toBytes(value)) : toHex(toBytes(value)));
  }, [onChange, value]);

  // Memoize suffix JSX to avoid re-creating on each render
  const suffixElement = useMemo(
    () => (
      <button
        className="text-accent cursor-pointer self-center px-4 text-xl font-semibold"
        onClick={convertStringToBytes}
        type="button"
      >
        #
      </button>
    ),
    [convertStringToBytes],
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

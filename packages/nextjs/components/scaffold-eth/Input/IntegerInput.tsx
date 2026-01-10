import { useCallback, useEffect, useMemo, useState } from "react";
import { parseEther } from "viem";
import { CommonInputProps, InputBase, IntegerVariant, isValidInteger } from "~~/components/scaffold-eth";

type IntegerInputProps = CommonInputProps<string> & {
  variant?: IntegerVariant;
  disableMultiplyBy1e18?: boolean;
};

export const IntegerInput = ({
  value,
  onChange,
  name,
  placeholder,
  disabled,
  variant = IntegerVariant.UINT256,
  disableMultiplyBy1e18 = false,
}: IntegerInputProps) => {
  const [inputError, setInputError] = useState(false);
  const multiplyBy1e18 = useCallback(() => {
    if (!value) {
      return;
    }
    return onChange(parseEther(value).toString());
  }, [onChange, value]);

  useEffect(() => {
    if (isValidInteger(variant, value)) {
      setInputError(false);
    } else {
      setInputError(true);
    }
  }, [value, variant]);

  // Memoize suffix JSX to avoid re-creating on each render
  const suffixElement = useMemo(() => {
    if (inputError || disableMultiplyBy1e18) {
      return null;
    }
    return (
      <div
        className="tooltip tooltip-top tooltip-secondary flex space-x-4 before:left-auto before:right-[-10px] before:transform-none before:content-[attr(data-tip)]"
        data-tip="Multiply by 1e18 (wei)"
      >
        <button
          className={`${disabled ? "cursor-not-allowed" : "cursor-pointer"} text-accent px-4 font-semibold`}
          onClick={multiplyBy1e18}
          disabled={disabled}
          type="button"
        >
          ∗
        </button>
      </div>
    );
  }, [inputError, disableMultiplyBy1e18, disabled, multiplyBy1e18]);

  return (
    <InputBase
      name={name}
      value={value}
      placeholder={placeholder}
      error={inputError}
      onChange={onChange}
      disabled={disabled}
      suffix={suffixElement}
    />
  );
};

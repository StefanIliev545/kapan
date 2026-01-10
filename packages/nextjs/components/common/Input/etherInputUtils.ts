/**
 * Shared utility functions for EtherInput component.
 * These conversion functions are network-agnostic and can be used
 * by both EVM and Starknet implementations.
 */

export const MAX_DECIMALS_USD = 2;

/**
 * Converts an ether value to its display value.
 * In USD mode, converts to USD using the native currency price.
 */
export function etherValueToDisplayValue(
  usdMode: boolean,
  etherValue: string,
  nativeCurrencyPrice: number,
): string {
  if (usdMode && nativeCurrencyPrice) {
    const parsedEthValue = parseFloat(etherValue);
    if (Number.isNaN(parsedEthValue)) {
      return etherValue;
    } else {
      // We need to round the value rather than use toFixed,
      // since otherwise a user would not be able to modify the decimal value
      return (
        Math.round(parsedEthValue * nativeCurrencyPrice * 10 ** MAX_DECIMALS_USD) /
        10 ** MAX_DECIMALS_USD
      ).toString();
    }
  } else {
    return etherValue;
  }
}

/**
 * Converts a display value back to ether value.
 * In USD mode, divides by the native currency price to get ETH equivalent.
 */
export function displayValueToEtherValue(
  usdMode: boolean,
  displayValue: string,
  nativeCurrencyPrice: number,
): string {
  if (usdMode && nativeCurrencyPrice) {
    const parsedDisplayValue = parseFloat(displayValue);
    if (Number.isNaN(parsedDisplayValue)) {
      // Invalid number.
      return displayValue;
    } else {
      // Compute the ETH value if a valid number.
      return (parsedDisplayValue / nativeCurrencyPrice).toString();
    }
  } else {
    return displayValue;
  }
}

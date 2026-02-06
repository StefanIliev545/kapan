/**
 * Shared input utilities for both EVM and Starknet input components.
 */

export interface CommonInputProps<T = string> {
  value: T;
  onChange: (newValue: T) => void;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const SIGNED_NUMBER_REGEX = /^-?\d*\.?\d*$/;
export const UNSIGNED_NUMBER_REGEX = /^\d*\.?\d*$/;

// Treat any dot-separated string as a potential ENS name
const ensRegex = /.+\..+/;
export const isENS = (address = "") => ensRegex.test(address);

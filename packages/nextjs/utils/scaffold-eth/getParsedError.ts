/**
 * @deprecated Use getErrorMessage from "~~/utils/errors" instead
 * This file is kept for backward compatibility.
 */
import { isUserRejection as checkUserRejection, getErrorMessage } from "../errors";

/**
 * Checks if an error is a user rejection
 * @deprecated Use isUserRejection from "~~/utils/errors" instead
 */
export const isUserRejection = checkUserRejection;

/**
 * Parses an viem/wagmi error to get a displayable string
 * @param e - error object
 * @returns parsed error string
 * @deprecated Use getErrorMessage from "~~/utils/errors" instead
 */
export const getParsedError = (error: unknown): string => {
  return getErrorMessage(error);
};

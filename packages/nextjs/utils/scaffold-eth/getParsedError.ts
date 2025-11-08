import { BaseError as BaseViemError, ContractFunctionRevertedError } from "viem";

/**
 * Checks if an error is a user rejection
 */
const isUserRejection = (error: any): boolean => {
  const errorMessage = error?.message || error?.shortMessage || error?.details || "";
  const lowerMessage = errorMessage.toLowerCase();
  return (
    lowerMessage.includes("user rejected") ||
    lowerMessage.includes("user denied") ||
    lowerMessage.includes("user cancelled") ||
    lowerMessage.includes("rejected") ||
    lowerMessage.includes("denied") ||
    lowerMessage.includes("cancelled") ||
    lowerMessage.includes("rejection") ||
    error?.code === 4001 || // MetaMask user rejection code
    error?.code === "ACTION_REJECTED" ||
    error?.code === "USER_REJECTED"
  );
};

/**
 * Parses an viem/wagmi error to get a displayable string
 * @param e - error object
 * @returns parsed error string
 */
export const getParsedError = (error: any): string => {
  // Check for user rejection first
  if (isUserRejection(error)) {
    return "User rejected the request";
  }

  const parsedError = error?.walk ? error.walk() : error;

  if (parsedError instanceof BaseViemError) {
    if (parsedError.details) {
      return parsedError.details;
    }

    if (parsedError.shortMessage) {
      if (
        parsedError instanceof ContractFunctionRevertedError &&
        parsedError.data &&
        parsedError.data.errorName !== "Error"
      ) {
        const customErrorArgs = parsedError.data.args?.toString() ?? "";
        return `${parsedError.shortMessage.replace(/reverted\.$/, "reverted with the following reason:")}\n${
          parsedError.data.errorName
        }(${customErrorArgs})`;
      }

      return parsedError.shortMessage;
    }

    return parsedError.message ?? parsedError.name ?? "An unknown error occurred";
  }

  return parsedError?.message ?? "An unknown error occurred";
};

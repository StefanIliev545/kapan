import { AccountInterface } from "starknet";
import { usePaymasterGasTokens } from "@starknet-react/core";
import { useTransactor } from "./useTransactor";
import { usePaymasterTransactor } from "./usePaymasterTransactor";
import { useSelectedGasToken } from "~~/contexts/SelectedGasTokenContext";
import { universalStrkAddress } from "~~/utils/Constants";

/**
 * Smart transactor that automatically chooses between regular and paymaster transactions
 * based on the selected gas token in the context.
 * 
 * - Uses paymaster when non-STRK token is selected
 * - Falls back to regular transactor when STRK is selected
 * 
 * @param _walletClient - Optional wallet client to use
 * @returns Transaction function that handles both regular and gasless transactions
 */
export const useSmartTransactor = (_walletClient?: AccountInterface) => {
  const { selectedToken } = useSelectedGasToken();
  const { data: paymasterTokens } = usePaymasterGasTokens();
  const regularTransactor = useTransactor(_walletClient);
  const paymasterTransactor = usePaymasterTransactor(_walletClient);

  // Determine if we should use paymaster (non-STRK token selected)
  const selectedAddr = selectedToken?.address?.toLowerCase();
  const strkAddr = universalStrkAddress.toLowerCase();
  const isSelectedStrk = selectedAddr === strkAddr || (selectedToken?.symbol?.toUpperCase?.() === "STRK");
  const isSupportedPaymasterToken = !!selectedAddr && !!paymasterTokens?.some((t: any) => (t?.token_address || "")?.toLowerCase() === selectedAddr);
  let customAmount: bigint | undefined;
  const selectedMode = selectedToken?.mode ?? "default";
  const isCustomMode = selectedMode === "collateral" || selectedMode === "borrow";

  if (selectedToken?.amount && isCustomMode) {
    try {
      customAmount = BigInt(selectedToken.amount);
    } catch (error) {
      console.warn("SmartTransactor: failed to parse custom gas token amount", error);
    }
  }

  const hasCustomConfig =
    isCustomMode &&
    customAmount !== undefined &&
    typeof selectedToken?.protocol === "string" &&
    selectedToken.protocol.trim().length > 0;

  const shouldUsePaymaster = hasCustomConfig || (!isSelectedStrk && isSupportedPaymasterToken);

  // Only log once per token change
  // console.log(`SmartTransactor: Using ${shouldUsePaymaster ? 'paymaster' : 'regular'} transactor for ${selectedToken?.symbol || 'STRK'}`);

  // Return the appropriate transactor based on selected gas token
  const transactor = shouldUsePaymaster ? paymasterTransactor : regularTransactor;
  
  // Wrap the transactor to add logging
  return async (tx: any) => {
    console.log('SmartTransactor executing with tx:', tx);
    console.log('Using transactor type:', shouldUsePaymaster ? 'paymaster' : 'regular');
    return await transactor(tx);
  };
};

// Name mappings from token address (lowercase hex) to a readable symbol.
//
// Two tiers:
//   - OVERRIDES: always take precedence, even when the contract returns a non-empty symbol().
//     e.g. bridged USDC still reports "USDC" on-chain but we want it displayed as "USDC.e"
//     so it doesn't collide with Circle-native USDC.
//   - FALLBACKS: used only when the on-chain symbol() is empty (e.g. ByteArray-based symbols
//     that the felt252 dispatcher reads as 0).

export const TOKEN_NAME_OVERRIDES: Record<string, string> = {
  "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8": "USDC.e",
};

export const TOKEN_NAME_FALLBACKS: Record<string, string> = {
  // Core tokens
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7": "ETH",
  "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac": "WBTC",
  // Circle-native USDC — symbol() is a ByteArray so the felt-dispatcher reads 0; fallback fills it in.
  "0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb": "USDC",
  "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8": "USDT",
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d": "STRK",
  "0x0057912720381af14b0e5c87aa4718ed5e527eab60b3801ebf702ab09139e38b": "wstETH",

  // Re7 xBTC pool
  "0x04e4fb1a9ca7e84bae609b9dc0078ad7719e49187ae7e425bb47d131710eddac": "mRe7BTC",
  "0x043a35c1425a0125ef8c171f1a75c6f31ef8648edcc8324b55ce1917db3f9b91": "xtBTC",
  "0x0580f3dc564a7b82f21d40d404b3842d490ae7205e6ac07b1b7af2b4a5183dc9": "xsBTC",
  "0x06a567e68c805323525fe1649adb80b03cddf92c23d2629a6779f54192dffc13": "xWBTC",
  "0x07dd3c80de9fcc5545f0cb83678826819c79619ed7992cc06ff81fc67cd2efe0": "xLBTC",
  "0x036834a40984312f7f7de8d31e3f6305b325389eaeea5b1c0664b2fb936461a4": "LBTC",
  "0x0593e034dda23eea82d2ba9a30960ed42cf4a01502cc2351dc9b9881f9931a68": "SolvBTC",
  "0x04daa17763b286d1e59b97c283c0b8c949994c361e426a28f743c67bdfe9a32f": "tBTC",
  "0x023a312ece4a275e38c9fc169e3be7b5613a0cb55fe1bece4422b09a88434573": "uniBTC",

  // Re7 yield
  "0x04be8945e61dc3e19ebadd1579a6bd53b262f51ba89e6f8b0c4bc9a7e3c633fc": "mRe7YIELD",
  // Endur xSTRK
  "0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a": "xSTRK",
  // Ekubo
  "0x075afe6402ad5a5c20dd25e10ec3b3986acaa647b77e4ae24b0cbc9a54a27a87": "EKUBO",
  // DOG token
  "0x040e81cfeb176bfdbc5047bbc55eb471cfab20a6b221f38d8fda134e1bfffca4": "DOG",
};

export const getTokenNameOverride = (address: string): string | undefined => {
  return TOKEN_NAME_OVERRIDES[address.toLowerCase()];
};

export const getTokenNameFallback = (address: string): string | undefined => {
  const key = address.toLowerCase();
  return TOKEN_NAME_FALLBACKS[key];
};

/**
 * Canonical display-name resolver for Starknet tokens.
 * Priority: override > on-chain symbol (when non-empty) > fallback > "UNKNOWN".
 * Pass `onChainSymbol` as the already-decoded string (e.g. via feltToString).
 */
export const resolveTokenDisplayName = (onChainSymbol: string | null | undefined, address: string): string => {
  const override = getTokenNameOverride(address);
  if (override) return override;
  if (onChainSymbol && onChainSymbol.trim().length > 0) return onChainSymbol;
  return getTokenNameFallback(address) ?? "UNKNOWN";
};



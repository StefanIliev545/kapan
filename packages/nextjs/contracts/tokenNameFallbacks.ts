// Static fallback mapping from token address (lowercase hex) to a readable symbol/name
// Used when tokens don't return a proper symbol on-chain

export const TOKEN_NAME_FALLBACKS: Record<string, string> = {
  // Core tokens
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7": "ETH",
  "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac": "WBTC",
  "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8": "USDC",
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

export const getTokenNameFallback = (address: string): string | undefined => {
  const key = address.toLowerCase();
  return TOKEN_NAME_FALLBACKS[key];
};



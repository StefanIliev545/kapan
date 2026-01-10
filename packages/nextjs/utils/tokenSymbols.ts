/**
 * Utility functions for handling token symbols, filtering, and sorting
 */

/**
 * Sanitizes a token symbol by removing special characters and converting to uppercase.
 * Used for normalizing token symbols for API lookups and display.
 *
 * @param name - The token name/symbol to sanitize
 * @returns The sanitized symbol in uppercase with only letters and dots
 *
 * @example
 * sanitizeSymbol("USD₮") // Returns "USDT"
 * sanitizeSymbol("W-ETH") // Returns "WETH"
 */
export const sanitizeSymbol = (name: string): string => {
  return name.replace("₮", "T").replace(/[^a-zA-Z.]/g, "").toUpperCase();
};

/**
 * Default token filter for displaying positions when wallet is not connected.
 * Shows only the most common/important tokens.
 */
export const DEFAULT_TOKEN_FILTER = new Set(["BTC", "ETH", "WETH", "USDC", "USDT", "USDC.E"]);

/**
 * Checks if a token should be shown based on the default filter.
 * Used when wallet is not connected to show only major tokens.
 *
 * @param tokenName - The token name/symbol to check
 * @returns True if token matches the default filter
 */
export const isDefaultToken = (tokenName: string): boolean => {
  return DEFAULT_TOKEN_FILTER.has(sanitizeSymbol(tokenName));
};

/**
 * Filters positions based on wallet connection status.
 * When connected, shows all positions. When disconnected, shows only default tokens.
 *
 * @param positions - Array of positions to filter
 * @param isWalletConnected - Whether a wallet is connected
 * @param getName - Function to extract token name from position (defaults to p.name)
 * @returns Filtered positions array
 */
export const filterPositionsByWalletStatus = <T extends { name: string }>(
  positions: T[],
  isWalletConnected: boolean,
  getName: (p: T) => string = (p) => p.name,
): T[] => {
  if (isWalletConnected) {
    return positions;
  }
  return positions.filter(p => isDefaultToken(getName(p)));
};

/**
 * Token with balance information for sorting
 */
export interface TokenWithBalance {
  hasBalance: boolean;
  formattedBalance: number;
}

/**
 * Sorts tokens by balance - tokens with balance first, then by amount descending.
 * Used in token selection modals to prioritize tokens user owns.
 *
 * @param a - First token
 * @param b - Second token
 * @returns Sort comparison value
 */
export const sortByBalance = <T extends TokenWithBalance>(a: T, b: T): number => {
  if (a.hasBalance !== b.hasBalance) {
    return Number(b.hasBalance) - Number(a.hasBalance);
  }
  return b.formattedBalance - a.formattedBalance;
};

/**
 * Enhances tokens with balance information for sorting.
 * Calculates hasBalance flag and formatted balance from raw balance and decimals.
 *
 * @param tokens - Array of tokens with rawBalance and optional decimals
 * @param formatBalance - Function to format raw balance to number
 * @returns Tokens enhanced with hasBalance and formattedBalance
 */
export const enhanceTokensWithBalanceInfo = <T extends { rawBalance?: bigint; decimals?: number }>(
  tokens: T[],
  formatBalance: (rawBalance: bigint, decimals: number) => number,
): (T & TokenWithBalance)[] => {
  return tokens.map(token => {
    const rawBalance = token.rawBalance ?? 0n;
    const decimals = token.decimals ?? 18;
    const formattedBalance = formatBalance(rawBalance, decimals);
    return {
      ...token,
      hasBalance: rawBalance > 0n,
      formattedBalance,
    };
  });
};

/**
 * Normalizes an address to lowercase for consistent comparison.
 *
 * @param address - Address string to normalize
 * @returns Lowercase address
 */
export const normalizeTokenAddress = (address: string): string => {
  return address.toLowerCase();
};

/**
 * Compares two addresses for equality (case-insensitive).
 *
 * @param a - First address
 * @param b - Second address
 * @returns True if addresses match
 */
export const addressesEqual = (a: string, b: string): boolean => {
  return normalizeTokenAddress(a) === normalizeTokenAddress(b);
};

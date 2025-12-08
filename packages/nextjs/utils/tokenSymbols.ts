/**
 * Utility functions for handling token symbols
 */

/**
 * Sanitizes a token symbol by removing special characters and converting to uppercase.
 * Used for normalizing token symbols for API lookups and display.
 * 
 * @param name - The token name/symbol to sanitize
 * @returns The sanitized symbol in uppercase with only letters and dots
 * 
 * @example
 * sanitizeSymbol("USDT₮") // Returns "USDTT"
 * sanitizeSymbol("W-ETH") // Returns "WETH"
 */
export const sanitizeSymbol = (name: string): string => {
  return name.replace("₮", "T").replace(/[^a-zA-Z.]/g, "").toUpperCase();
};

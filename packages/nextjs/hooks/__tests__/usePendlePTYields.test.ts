import { describe, it, expect } from "vitest";
import {
  isPTToken,
  parsePTToken,
  normalizePTSymbolForLookup,
  extractPTBaseToken,
  getPTShortName,
} from "../usePendlePTYields";

describe("isPTToken", () => {
  it("detects PT- prefix", () => {
    expect(isPTToken("PT-sUSDai-20NOV2025")).toBe(true);
    expect(isPTToken("PT-reUSD-29JAN2026")).toBe(true);
    expect(isPTToken("pt-token-123")).toBe(true);
  });

  it("detects PT space prefix", () => {
    expect(isPTToken("PT sUSDai 20NOV2025")).toBe(true);
  });

  it("rejects non-PT tokens", () => {
    expect(isPTToken("USDC")).toBe(false);
    expect(isPTToken("sUSDai")).toBe(false);
    expect(isPTToken("aPT-token")).toBe(false);
  });
});

describe("parsePTToken", () => {
  it("parses standard PT token with date", () => {
    const result = parsePTToken("PT-sUSDai-20NOV2025");
    expect(result.isPT).toBe(true);
    if (result.isPT) {
      expect(result.shortName).toBe("PT-sUSDai");
      expect(result.baseToken).toBe("sUSDai");
      expect(result.rawMaturityDate).toBe("20NOV2025");
      expect(result.maturityDate?.getFullYear()).toBe(2025);
      expect(result.maturityDate?.getMonth()).toBe(10); // November = 10
      expect(result.maturityDate?.getDate()).toBe(20);
      expect(result.chainSuffix).toBeNull();
    }
  });

  it("parses PT token with chain suffix", () => {
    const result = parsePTToken("PT-sUSDai-20NOV2025-(UNI)");
    expect(result.isPT).toBe(true);
    if (result.isPT) {
      expect(result.shortName).toBe("PT-sUSDai");
      expect(result.baseToken).toBe("sUSDai");
      expect(result.chainSuffix).toBe("UNI");
    }
  });

  it("parses PT token with ETH chain suffix", () => {
    const result = parsePTToken("PT-cUSD-29JAN2026-(ETH)");
    expect(result.isPT).toBe(true);
    if (result.isPT) {
      expect(result.shortName).toBe("PT-cUSD");
      expect(result.baseToken).toBe("cUSD");
      expect(result.chainSuffix).toBe("ETH");
      expect(result.maturityDate?.getFullYear()).toBe(2026);
      expect(result.maturityDate?.getMonth()).toBe(0); // January = 0
      expect(result.maturityDate?.getDate()).toBe(29);
    }
  });

  it("parses PT token with ARB chain suffix", () => {
    const result = parsePTToken("PT-USDai-19FEB2026-(ARB)");
    expect(result.isPT).toBe(true);
    if (result.isPT) {
      expect(result.shortName).toBe("PT-USDai");
      expect(result.baseToken).toBe("USDai");
      expect(result.chainSuffix).toBe("ARB");
    }
  });

  it("parses PT-reUSD token", () => {
    const result = parsePTToken("PT-reUSD-29JAN2026");
    expect(result.isPT).toBe(true);
    if (result.isPT) {
      expect(result.shortName).toBe("PT-reUSD");
      expect(result.baseToken).toBe("reUSD");
    }
  });

  it("parses PT-reUSD with chain suffix", () => {
    const result = parsePTToken("PT-reUSD-29JAN2026-(ARB)");
    expect(result.isPT).toBe(true);
    if (result.isPT) {
      expect(result.shortName).toBe("PT-reUSD");
      expect(result.baseToken).toBe("reUSD");
      expect(result.chainSuffix).toBe("ARB");
    }
  });

  it("handles single digit day", () => {
    const result = parsePTToken("PT-token-5JAN2026");
    expect(result.isPT).toBe(true);
    if (result.isPT) {
      expect(result.maturityDate?.getDate()).toBe(5);
    }
  });

  it("returns non-PT for regular tokens", () => {
    const result = parsePTToken("USDC");
    expect(result.isPT).toBe(false);
  });
});

describe("normalizePTSymbolForLookup", () => {
  it("strips chain suffix with dash", () => {
    expect(normalizePTSymbolForLookup("PT-sUSDai-20NOV2025-(UNI)")).toBe("pt-susdai-20nov2025");
    expect(normalizePTSymbolForLookup("PT-cUSD-29JAN2026-(ETH)")).toBe("pt-cusd-29jan2026");
    expect(normalizePTSymbolForLookup("PT-USDai-19FEB2026-(ARB)")).toBe("pt-usdai-19feb2026");
  });

  it("handles symbols without chain suffix", () => {
    expect(normalizePTSymbolForLookup("PT-sUSDai-20NOV2025")).toBe("pt-susdai-20nov2025");
  });

  it("lowercases the result", () => {
    expect(normalizePTSymbolForLookup("PT-TOKEN-123")).toBe("pt-token-123");
  });
});

describe("extractPTBaseToken", () => {
  it("extracts base token from standard PT", () => {
    expect(extractPTBaseToken("PT-sUSDai-20NOV2025")).toBe("susdai");
    expect(extractPTBaseToken("PT-reUSD-29JAN2026")).toBe("reusd");
    expect(extractPTBaseToken("PT-cUSD-29JAN2026-(ETH)")).toBe("cusd");
  });

  it("returns empty for non-PT tokens", () => {
    expect(extractPTBaseToken("USDC")).toBe("");
  });
});

describe("getPTShortName", () => {
  it("returns short name without date", () => {
    expect(getPTShortName("PT-sUSDai-20NOV2025")).toBe("PT-sUSDai");
    expect(getPTShortName("PT-reUSD-29JAN2026-(ARB)")).toBe("PT-reUSD");
  });

  it("returns original for non-PT tokens", () => {
    expect(getPTShortName("USDC")).toBe("USDC");
  });
});

// Test matching scenarios - these simulate what findYield does
describe("PT symbol matching scenarios", () => {
  // Simulate the matching logic
  const mockPendleSymbols = [
    "PT-sUSDai-20NOV2025",
    "PT-stETH-30DEC2027",
    "PT-USDe-29MAY2025",
    "PT-rsETH-26DEC2024",
    "PT-weETH-26DEC2024",
    "PT-eETH-26SEP2024",
    // Add reUSD if it exists in Pendle
    "PT-reUSD-29JAN2026",
  ];

  const findMatchingSymbol = (searchSymbol: string): string | undefined => {
    const normalized = normalizePTSymbolForLookup(searchSymbol);

    // Exact match after normalization
    const exactMatch = mockPendleSymbols.find(
      s => s.toLowerCase() === normalized
    );
    if (exactMatch) return exactMatch;

    // Parse and compare components
    const parsed = parsePTToken(searchSymbol);
    if (!parsed.isPT) return undefined;

    const baseToken = parsed.baseToken.toLowerCase();
    const maturityDate = parsed.maturityDate;

    for (const pendleSymbol of mockPendleSymbols) {
      const pendleParsed = parsePTToken(pendleSymbol);
      if (!pendleParsed.isPT) continue;

      const pendleBaseToken = pendleParsed.baseToken.toLowerCase();

      // Check base token match
      const baseMatch =
        baseToken === pendleBaseToken ||
        baseToken.includes(pendleBaseToken) ||
        pendleBaseToken.includes(baseToken);

      if (!baseMatch) continue;

      // Check date match (within 2 days)
      if (maturityDate && pendleParsed.maturityDate) {
        const daysDiff = Math.abs(
          maturityDate.getTime() - pendleParsed.maturityDate.getTime()
        ) / (1000 * 60 * 60 * 24);
        if (daysDiff <= 2) return pendleSymbol;
      }
    }

    return undefined;
  };

  it("matches exact symbol", () => {
    expect(findMatchingSymbol("PT-sUSDai-20NOV2025")).toBe("PT-sUSDai-20NOV2025");
  });

  it("matches symbol with chain suffix stripped", () => {
    expect(findMatchingSymbol("PT-sUSDai-20NOV2025-(UNI)")).toBe("PT-sUSDai-20NOV2025");
  });

  it("matches PT-reUSD", () => {
    expect(findMatchingSymbol("PT-reUSD-29JAN2026")).toBe("PT-reUSD-29JAN2026");
  });

  it("matches PT-reUSD with chain suffix", () => {
    expect(findMatchingSymbol("PT-reUSD-29JAN2026-(ARB)")).toBe("PT-reUSD-29JAN2026");
  });
});

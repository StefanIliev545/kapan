import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

// Logo constants to avoid duplication
const LOGO_USDC = "/logos/usdc.svg";
const LOGO_USDT = "/logos/usdt.svg";
const LOGO_ETHEREUM = "/logos/ethereum.svg";

// Common rich address for Arbitrum tokens
const ARBITRUM_RICH_ADDRESS = "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D";

const externalContracts = {
  42161: {
    USDC: {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      abi: [
        {
          constant: true,
          inputs: [],
          name: "decimals",
          outputs: [
            {
              name: "",
              type: "uint8",
            },
          ],
          payable: false,
          stateMutability: "view",
          type: "function",
        },
      ],
      logo: LOGO_USDC,
      richAddress: ARBITRUM_RICH_ADDRESS,
    },
    USDT: {
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      abi: [
        {
          constant: true,
          inputs: [],
          name: "decimals",
          outputs: [
            {
              name: "",
              type: "uint8",
            },
          ],
          payable: false,
          stateMutability: "view",
          type: "function",
        },
      ],
      logo: LOGO_USDT,
      richAddress: ARBITRUM_RICH_ADDRESS,
    },
    USDCe: {
      address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
      abi: [
        {
          constant: true,
          inputs: [],
          name: "decimals",
          outputs: [
            {
              name: "",
              type: "uint8",
            },
          ],
          payable: false,
          stateMutability: "view",
          type: "function",
        },
      ],
      logo: LOGO_USDC,
      richAddress: ARBITRUM_RICH_ADDRESS,
    },
    eth: {
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      abi: [
        {
          constant: true,
          inputs: [],
          name: "decimals",
          outputs: [
            {
              name: "",
              type: "uint8",
            },
          ],
          payable: false,
          stateMutability: "view",
          type: "function",
        },
      ],
      logo: LOGO_ETHEREUM,
      richAddress: ARBITRUM_RICH_ADDRESS,
    },
    ETH: {
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      abi: [
        {
          constant: true,
          inputs: [],
          name: "decimals",
          outputs: [
            {
              name: "",
              type: "uint8",
            },
          ],
          payable: false,
          stateMutability: "view",
          type: "function",
        },
      ],
      logo: LOGO_ETHEREUM,
      richAddress: ARBITRUM_RICH_ADDRESS,
    },
  },
  31337: {
    USDC: {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      abi: [
        {
          constant: true,
          inputs: [],
          name: "decimals",
          outputs: [
            {
              name: "",
              type: "uint8",
            },
          ],
          payable: false,
          stateMutability: "view",
          type: "function",
        },
      ],
      logo: LOGO_USDC,
      richAddress: ARBITRUM_RICH_ADDRESS,
    },
    USDT: {
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      abi: [
        {
          constant: true,
          inputs: [],
          name: "decimals",
          outputs: [
            {
              name: "",
              type: "uint8",
            },
          ],
          payable: false,
          stateMutability: "view",
          type: "function",
        },
      ],
      logo: LOGO_USDT,
      richAddress: ARBITRUM_RICH_ADDRESS,
    },
    USDCe: {
      address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
      abi: [
        {
          constant: true,
          inputs: [],
          name: "decimals",
          outputs: [
            {
              name: "",
              type: "uint8",
            },
          ],
          payable: false,
          stateMutability: "view",
          type: "function",
        },
      ],
      logo: LOGO_USDC,
      richAddress: ARBITRUM_RICH_ADDRESS,
    },
    eth: {
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      abi: [
        {
          constant: true,
          inputs: [],
          name: "decimals",
          outputs: [
            {
              name: "",
              type: "uint8",
            },
          ],
          payable: false,
          stateMutability: "view",
          type: "function",
        },
      ],
      logo: LOGO_ETHEREUM,
      richAddress: ARBITRUM_RICH_ADDRESS,
    },
    ETH: {
      address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      abi: [
        {
          constant: true,
          inputs: [],
          name: "decimals",
          outputs: [
            {
              name: "",
              type: "uint8",
            },
          ],
          payable: false,
          stateMutability: "view",
          type: "function",
        },
      ],
      logo: LOGO_ETHEREUM,
      richAddress: ARBITRUM_RICH_ADDRESS,
    },
  },
} as const;

const contractLogos = {
  USDC: "/logos/usdc.svg",
  USDT: "/logos/usdt.svg",
  USDCe: "/logos/usdc.svg",
  eth: "/logos/ethereum.svg",
};

export const contractNameToLogo = (contractName: keyof typeof contractLogos) => {
  return contractLogos[contractName];
};

export const tokenNameToLogo = (tokenName: string) => {
  // Handle special characters and Euler vault tokens
  if (tokenName === "USD₮0" || tokenName.toLowerCase() === "usd₮0" || tokenName.toLowerCase() === "usdt0") {
    return "/logos/usdt.svg";
  }
  const lower = tokenName.toLowerCase();

  // Map tokens without dedicated logos to similar token logos
  const tokenFallbacks: Record<string, string> = {
    autousdai: "/logos/susdai.svg", // Auto-compounding USDai -> use sUSDai logo
    thbill: "/logos/usdc.svg",     // T-Bill token, use stable coin icon
    rlp: "/logos/default.svg",     // Resolv LP token
    syrupusdc: "/logos/usdc.svg",  // Syrup USDC
    teth: "/logos/ethereum.svg",   // Threshold ETH
  };

  const fallback = tokenFallbacks[lower];
  if (fallback) return fallback;

  // Handle Euler vault tokens (e-prefixed symbols)
  // Format: ePT-xxx-DATE-N (Euler-wrapped PT tokens) or eXXX-N (Euler vault shares)
  // Examples:
  //   ePT-USDai-20NOV2025-2 -> ptusdai.svg
  //   ePT-sUSDai-20NOV2025-2 -> ptsusdai.svg
  //   eUSDai-2 -> susdai.svg (fallback since usdai doesn't exist)
  //   eELIT-2 -> elit.svg (will use default if not found)
  if (lower.startsWith("e") && !lower.startsWith("eth") && !lower.startsWith("ezeth") && !lower.startsWith("eurs")) {
    // Check if it's an Euler-wrapped PT token (ePT-xxx)
    if (lower.startsWith("ept-")) {
      // Extract base token from ePT-xxx-DATE-N format
      const withoutPrefix = lower.slice(4); // Remove "ept-"
      const baseToken = withoutPrefix
        .replace(/-\([a-z]+\)$/i, "") // -(ARB), -(ETH), etc.
        .replace(/-\d{1,2}[a-z]{3}\d{4}(-\d+)?$/i, "") // -15JAN2026 or -15JAN2026-1
        .replace(/-1\d{9}(-\d+)?$/, "") // Unix timestamp with optional version
        .replace(/-\d+$/, ""); // Trailing version number like -2
      return `/logos/pt${baseToken}.svg`;
    }

    // Check if it's an Euler vault share (eXXX-N format)
    // e.g., eUSDai-2, eELIT-2
    const eulerVaultMatch = lower.match(/^e([a-z0-9]+)-\d+$/);
    if (eulerVaultMatch) {
      const baseToken = eulerVaultMatch[1];
      // Special mappings for tokens without dedicated logos
      const eulerTokenMappings: Record<string, string> = {
        usdai: "/logos/susdai.svg", // USDai -> use sUSDai logo as fallback
      };
      if (eulerTokenMappings[baseToken]) {
        return eulerTokenMappings[baseToken];
      }
      // Try the base token directly
      return `/logos/${baseToken}.svg`;
    }
  }

  // Handle Pendle PT tokens (e.g., "PT-USDe-15JAN2026" -> "ptusde")
  // Strip dates like "-15JAN2026" or Unix timestamps like "-1750896023"
  // Also handle bridged versions like "PT-USDai-19FEB2026-(ARB)"
  // Also handle Euler-wrapped PT tokens like "PT ePT-USDai-19FEB2026-1" -> "ptusdai"
  if (lower.startsWith("pt-") || lower.startsWith("pt ")) {
    let withoutPrefix: string;

    if (lower.startsWith("pt ")) {
      // Handle "PT ePT-xxx" format (Euler-wrapped PT tokens)
      // e.g., "pt ept-usdai-19feb2026-1" -> extract "usdai"
      withoutPrefix = lower.slice(3); // Remove "pt "

      // Check for ePT- prefix (Euler-wrapped)
      if (withoutPrefix.startsWith("ept-")) {
        withoutPrefix = withoutPrefix.slice(4); // Remove "ept-"
      }
    } else {
      // Handle standard "pt-xxx" format
      withoutPrefix = lower.slice(3); // Remove "pt-"
    }

    // Remove chain suffix like "-(arb)", "-(eth)", etc. first
    // Then remove date suffix (pattern: -DDMMMYYYY like -15jan2026) or Unix timestamp (-1xxxxxxxxx)
    // Also remove trailing version numbers like "-1", "-2" at the end
    const baseToken = withoutPrefix
      .replace(/-\([a-z]+\)$/i, "") // -(ARB), -(ETH), etc.
      .replace(/-\d{1,2}[a-z]{3}\d{4}(-\d+)?$/i, "") // -15JAN2026 or -15JAN2026-1
      .replace(/-1\d{9}(-\d+)?$/, ""); // -1750896023 or -1750896023-1 (Unix timestamp with optional version)
    return `/logos/pt${baseToken}.svg`;
  }

  // Handle GMX GLV tokens (e.g., "GLV [WETH-USDC]" -> use GMX logo)
  if (lower.startsWith("glv")) {
    return "/logos/gmx.svg";
  }

  // Handle GMX GM tokens (e.g., "GM:ETH/USD[WETH-USDC]" -> use GM logo)
  if (lower.startsWith("gm:") || lower.startsWith("gm ") || lower === "gm") {
    return "/logos/gm.svg";
  }

  // Central PNG logo overrides for tokens that don't have svgs
  const pngLogoMap: Record<string, string> = {
    ekubo: "/logos/ekubo.png",
    xstrk: "/logos/xstrk.png",
    lbtc: "/logos/lbtc.png",
    xwbtc: "/logos/xwbtc.png",
    xtbtc: "/logos/xtbtc.png",
    xlbtc: "/logos/xlbtc.png",
    mre7btc: "/logos/mre7btc.png",
    mre7yield: "/logos/mre7yield.png",
    solvbtc: "/logos/solvbtc.png",
    dog: "/logos/dog.png",
    tbtc: "/logos/threshold-btc.png", // threshold's tBTC
    unibtc: "/logos/unibtc.png",
    xsbtc: "/logos/xsolvbtc.png",
    lyu: "/logos/lyu.png",
    usdai: "/logos/usdai.png",
  };

  const png = pngLogoMap[lower];
  if (png) return png;
  return `/logos/${lower}.svg`;
};

export const ERC20ABI = [
  {
    constant: true,
    inputs: [],
    name: "name",
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "_spender",
        type: "address",
      },
      {
        name: "_value",
        type: "uint256",
      },
    ],
    name: "approve",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "totalSupply",
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "_from",
        type: "address",
      },
      {
        name: "_to",
        type: "address",
      },
      {
        name: "_value",
        type: "uint256",
      },
    ],
    name: "transferFrom",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [
      {
        name: "",
        type: "uint8",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [
      {
        name: "_owner",
        type: "address",
      },
    ],
    name: "balanceOf",
    outputs: [
      {
        name: "balance",
        type: "uint256",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      {
        name: "_to",
        type: "address",
      },
      {
        name: "_value",
        type: "uint256",
      },
    ],
    name: "transfer",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [
      {
        name: "_owner",
        type: "address",
      },
      {
        name: "_spender",
        type: "address",
      },
    ],
    name: "allowance",
    outputs: [
      {
        name: "",
        type: "uint256",
      },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    payable: true,
    stateMutability: "payable",
    type: "fallback",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "owner",
        type: "address",
      },
      {
        indexed: true,
        name: "spender",
        type: "address",
      },
      {
        indexed: false,
        name: "value",
        type: "uint256",
      },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "from",
        type: "address",
      },
      {
        indexed: true,
        name: "to",
        type: "address",
      },
      {
        indexed: false,
        name: "value",
        type: "uint256",
      },
    ],
    name: "Transfer",
    type: "event",
  },
];

export default externalContracts satisfies GenericContractsDeclaration;

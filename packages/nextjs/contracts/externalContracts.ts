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
  if (tokenName == "USD₮0") {
    // stupid shit
    return "/logos/usdt.svg";
  }
  const lower = tokenName.toLowerCase();

  // Handle Pendle PT tokens (e.g., "PT-USDe-15JAN2026" -> "ptusde")
  // Strip dates like "-15JAN2026" or Unix timestamps like "-1750896023"
  // Also handle bridged versions like "PT-USDai-19FEB2026-(ARB)"
  if (lower.startsWith("pt-")) {
    // Extract base token: "pt-usde-15jan2026" -> "usde"
    const withoutPrefix = lower.slice(3); // Remove "pt-"
    // Remove chain suffix like "-(arb)", "-(eth)", etc. first
    // Then remove date suffix (pattern: -DDMMMYYYY like -15jan2026) or Unix timestamp (-1xxxxxxxxx)
    const baseToken = withoutPrefix
      .replace(/-\([a-z]+\)$/i, "") // -(ARB), -(ETH), etc.
      .replace(/-\d{1,2}[a-z]{3}\d{4}$/i, "") // -15JAN2026
      .replace(/-1\d{9}$/, ""); // -1750896023 (Unix timestamp)
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

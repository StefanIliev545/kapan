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

// Protocol icons for lending protocols
export const PROTOCOL_ICONS: Record<string, string> = {
  aave: "/logos/aave.svg",
  compound: "/logos/compound.svg",
  morpho: "/logos/morpho.svg",
  venus: "/logos/venus.svg",
  euler: "/logos/euler.svg",
};

export const contractNameToLogo = (contractName: keyof typeof contractLogos) => {
  return contractLogos[contractName];
};

// Helper: strip date/version suffixes from PT/Euler token names
function stripPtSuffixes(name: string): string {
  return name
    .replace(/-\([a-z]+\)$/i, "")
    .replace(/-\d{1,2}[a-z]{3}\d{4}(-\d+)?$/i, "")
    .replace(/-1\d{9}(-\d+)?$/, "")
    .replace(/-\d+$/, "");
}

function resolveEulerVaultLogo(lower: string): string | null {
  if (lower.startsWith("ept-")) {
    return `/logos/pt${stripPtSuffixes(lower.slice(4))}.svg`;
  }
  const m = lower.match(/^e([a-z0-9]+)-\d+$/);
  if (!m) return null;
  const eulerMap: Record<string, string> = { usdai: "/logos/susdai.svg" };
  return eulerMap[m[1]] ?? `/logos/${m[1]}.svg`;
}

function resolvePtTokenLogo(lower: string): string {
  let w = lower.startsWith("pt ") ? lower.slice(3) : lower.slice(3);
  if (lower.startsWith("pt ") && w.startsWith("ept-")) w = w.slice(4);
  return `/logos/pt${stripPtSuffixes(w)}.svg`;
}

const TOKEN_FALLBACKS: Record<string, string> = {
  autousdai: "/logos/susdai.svg",
  thbill: "/logos/usdc.svg",
  rlp: "/logos/default.svg",
  syrupusdc: "/logos/usdc.svg",
  teth: "/logos/ethereum.svg",
  // TODO: AARBWBTC is Aave's aToken receipt for WBTC on Arbitrum — ideally a composite icon
  // with WBTC large + small Aave/Arb badges, but WBTC icon works for now
  aarbwbtc: "/logos/wbtc.svg",
  vaultbtc: "/logos/wbtc.svg",
  // USD-pegged without dedicated icons
  usd: "/logos/usdc.svg",
  axusd: "/logos/usdc.svg",
  // Truly unknown — generic fallback
  ghost: "/logos/default.svg",
  elit: "/logos/default.svg",
  credit: "/logos/default.svg",
  osak: "/logos/default.svg",
  labu: "/logos/default.svg",
};

const PNG_LOGO_MAP: Record<string, string> = {
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
  tbtc: "/logos/threshold-btc.png",
  unibtc: "/logos/unibtc.png",
  xsbtc: "/logos/xsolvbtc.png",
  lyu: "/logos/lyu.png",
  usdai: "/logos/susdai.svg",
  frxusd: "/logos/frxusd.png",
  fxusd: "/logos/fxusd.png",
  bal: "/logos/bal.png",
  eul: "/logos/eul.png",
  yobtc: "/logos/yobtc.png",
  ibtc: "/logos/ibtc.png",
  jrt: "/logos/jrt.png",
  rex: "/logos/rex.png",
  xpet: "/logos/xpet.png",
};

function isEulerPrefixed(lower: string): boolean {
  return lower.startsWith("e") && !lower.startsWith("eth") && !lower.startsWith("ezeth") && !lower.startsWith("eurs");
}

export const tokenNameToLogo = (tokenName: string) => {
  if (tokenName === "USD₮0" || tokenName.toLowerCase() === "usd₮0" || tokenName.toLowerCase() === "usdt0") {
    return "/logos/usdt.svg";
  }
  const lower = tokenName.toLowerCase();

  const fallback = TOKEN_FALLBACKS[lower];
  if (fallback) return fallback;

  if (isEulerPrefixed(lower)) {
    const eulerLogo = resolveEulerVaultLogo(lower);
    if (eulerLogo) return eulerLogo;
  }

  if (lower.startsWith("pt-") || lower.startsWith("pt ")) return resolvePtTokenLogo(lower);
  if (lower.startsWith("glv")) return "/logos/gmx.svg";
  if (lower.startsWith("gm:") || lower.startsWith("gm ") || lower === "gm") return "/logos/gm.svg";

  const png = PNG_LOGO_MAP[lower];
  if (png) return png;
  // Guard against invalid characters in token names (e.g., "???" from unresolved symbols)
  if (!lower || /[^a-z0-9._-]/.test(lower)) return "/logos/token.svg";
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

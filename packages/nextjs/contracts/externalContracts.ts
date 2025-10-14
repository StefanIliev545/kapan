import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

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
      logo: "/logos/usdc.svg",
      richAddress: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
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
      logo: "/logos/usdt.svg",
      richAddress: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
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
      logo: "/logos/usdc.svg",
      richAddress: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
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
      logo: "/logos/ethereum.svg",
      richAddress: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
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
      logo: "/logos/ethereum.svg",
      richAddress: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
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
      logo: "/logos/usdc.svg",
      richAddress: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
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
      logo: "/logos/usdt.svg",
      richAddress: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
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
      logo: "/logos/usdc.svg",
      richAddress: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
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
      logo: "/logos/ethereum.svg",
      richAddress: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
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
      logo: "/logos/ethereum.svg",
      richAddress: "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D",
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
    tbtc: "/logos/threshold-btc.png", // threshold’s tBTC
    unibtc: "/logos/unibtc.png",
    xsbtc: "/logos/xsolvbtc.png",
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

import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

const externalContracts = {
  42161: {},
  31337: {
    USDC: {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      abi:  [
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
      abi:  [
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
      abi:  [
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
      abi:  [
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
  return `/logos/${tokenName.toLowerCase()}.svg`;
};

export default externalContracts satisfies GenericContractsDeclaration;

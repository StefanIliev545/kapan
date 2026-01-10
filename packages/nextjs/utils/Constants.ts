// Eth
const universalEthAddress =
  "0x49D36570D4E46F48E99674BD3FCC84644DDD6B96F7C741B1562B82F9E004DC7" as const;

const devnetEthClassHash =
  "0x046ded64ae2dead6448e247234bab192a9c483644395b66f2155f2614e5804b0" as const;

const sepoliaMainnetEthClassHash =
  "0x07f3777c99f3700505ea966676aac4a0d692c2a9f5e667f4c606b51ca1dd3420" as const;

// Strk
const universalStrkAddress =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d" as const;

const sepoliaMainnetStrkClassHash =
  "0x04ad3c1dc8413453db314497945b6903e1c766495a1e60492d44da9c2a986e4b" as const;

const devnetStrkClassHash =
  "0x046ded64ae2dead6448e247234bab192a9c483644395b66f2155f2614e5804b0" as const;

// Cairo type constants for Starknet ABI
const CAIRO_U256 = "core::integer::u256";
const CAIRO_CONTRACT_ADDRESS = "core::starknet::contract_address::ContractAddress";
const CAIRO_BOOL = "core::bool";

const universalErc20Abi = [
  {
    type: "impl",
    name: "ERC20Impl",
    interface_name: "openzeppelin::token::erc20::interface::IERC20",
  },
  {
    name: "openzeppelin::token::erc20::interface::IERC20",
    type: "interface",
    items: [
      {
        name: "name",
        type: "function",
        inputs: [],
        outputs: [
          {
            type: "core::felt252",
          },
        ],
        state_mutability: "view",
      },
      {
        name: "symbol",
        type: "function",
        inputs: [],
        outputs: [
          {
            type: "core::felt252",
          },
        ],
        state_mutability: "view",
      },
      {
        name: "decimals",
        type: "function",
        inputs: [],
        outputs: [
          {
            type: "core::integer::u8",
          },
        ],
        state_mutability: "view",
      },
      {
        name: "total_supply",
        type: "function",
        inputs: [],
        outputs: [
          {
            type: CAIRO_U256,
          },
        ],
        state_mutability: "view",
      },
      {
        name: "balance_of",
        type: "function",
        inputs: [
          {
            name: "account",
            type: CAIRO_CONTRACT_ADDRESS,
          },
        ],
        outputs: [
          {
            type: CAIRO_U256,
          },
        ],
        state_mutability: "view",
      },
      {
        name: "allowance",
        type: "function",
        inputs: [
          {
            name: "owner",
            type: CAIRO_CONTRACT_ADDRESS,
          },
          {
            name: "spender",
            type: CAIRO_CONTRACT_ADDRESS,
          },
        ],
        outputs: [
          {
            type: CAIRO_U256,
          },
        ],
        state_mutability: "view",
      },
      {
        name: "transfer",
        type: "function",
        inputs: [
          {
            name: "recipient",
            type: CAIRO_CONTRACT_ADDRESS,
          },
          {
            name: "amount",
            type: CAIRO_U256,
          },
        ],
        outputs: [
          {
            type: CAIRO_BOOL,
          },
        ],
        state_mutability: "external",
      },
      {
        name: "transfer_from",
        type: "function",
        inputs: [
          {
            name: "sender",
            type: CAIRO_CONTRACT_ADDRESS,
          },
          {
            name: "recipient",
            type: CAIRO_CONTRACT_ADDRESS,
          },
          {
            name: "amount",
            type: CAIRO_U256,
          },
        ],
        outputs: [
          {
            type: CAIRO_BOOL,
          },
        ],
        state_mutability: "external",
      },
      {
        name: "approve",
        type: "function",
        inputs: [
          {
            name: "spender",
            type: CAIRO_CONTRACT_ADDRESS,
          },
          {
            name: "amount",
            type: CAIRO_U256,
          },
        ],
        outputs: [
          {
            type: CAIRO_BOOL,
          },
        ],
        state_mutability: "external",
      },
    ],
  },
  {
    name: "ERC20CamelOnlyImpl",
    type: "impl",
    interface_name: "openzeppelin::token::erc20::interface::IERC20CamelOnly",
  },
  {
    type: "interface",
    name: "openzeppelin::token::erc20::interface::IERC20CamelOnly",
    items: [
      {
        name: "totalSupply",
        type: "function",
        inputs: [],
        outputs: [
          {
            type: CAIRO_U256,
          },
        ],
        state_mutability: "view",
      },
      {
        name: "balanceOf",
        type: "function",
        inputs: [
          {
            name: "account",
            type: CAIRO_CONTRACT_ADDRESS,
          },
        ],
        outputs: [
          {
            type: CAIRO_U256,
          },
        ],
        state_mutability: "view",
      },
      {
        name: "transferFrom",
        type: "function",
        inputs: [
          {
            name: "sender",
            type: CAIRO_CONTRACT_ADDRESS,
          },
          {
            name: "recipient",
            type: CAIRO_CONTRACT_ADDRESS,
          },
          {
            name: "amount",
            type: CAIRO_U256,
          },
        ],
        outputs: [
          {
            type: CAIRO_BOOL,
          },
        ],
        state_mutability: "external",
      },
    ],
  },
  {
    kind: "struct",
    name: "openzeppelin::token::erc20_v070::erc20::ERC20::Transfer",
    type: "event",
    members: [
      {
        kind: "key",
        name: "from",
        type: CAIRO_CONTRACT_ADDRESS,
      },
      {
        kind: "key",
        name: "to",
        type: CAIRO_CONTRACT_ADDRESS,
      },
      {
        kind: "data",
        name: "value",
        type: CAIRO_U256,
      },
    ],
  },
  {
    kind: "enum",
    name: "openzeppelin::token::erc20_v070::erc20::ERC20::Event",
    type: "event",
    variants: [
      {
        kind: "nested",
        name: "Transfer",
        type: "openzeppelin::token::erc20_v070::erc20::ERC20::Transfer",
      },
    ],
  },
] as const;

export const LAST_CONNECTED_TIME_LOCALSTORAGE_KEY = "lastConnectedTime";

export {
  devnetEthClassHash,
  devnetStrkClassHash,
  universalEthAddress,
  sepoliaMainnetEthClassHash,
  universalStrkAddress,
  sepoliaMainnetStrkClassHash,
  universalErc20Abi,
};

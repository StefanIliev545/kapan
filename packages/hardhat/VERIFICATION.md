# Smart Contract Verification Guide

This document explains how contracts are automatically verified on Etherscan when deployed, and how to manually verify contracts if needed.

## Disabling Verification (Development Security)

**⚠️ IMPORTANT: During development, disable automatic verification to prevent bots from scanning your contracts!**

Set this environment variable in your `.env` file:

```bash
DISABLE_VERIFICATION=true
```

This will skip all contract verification, making it harder for exploit bots to analyze your source code. **Only remove this flag when you're ready for production deployment.**

## Automatic Verification

All contracts deployed using the deployment scripts will be automatically verified on Etherscan (or the appropriate block explorer) when deployed to supported networks.

The verification happens after a 60-second delay to allow the block explorer to index the contract.

**Note:** Verification is automatically disabled for:
- Local networks (`hardhat`, `localhost`)
- When `DISABLE_VERIFICATION=true` is set

### Supported Networks

The following networks have automatic verification configured:

- Ethereum Mainnet and Sepolia
- Arbitrum One and Sepolia
- Optimism Mainnet and Sepolia
- Polygon Mainnet and Mumbai
- Base Mainnet and Sepolia

## Environment Variables

To use the verification features, set the following environment variables in your `.env` file:

```bash
# Disable verification during development (prevents bot scanning)
DISABLE_VERIFICATION=true

# Block explorer API keys (only needed when verification is enabled)
ETHERSCAN_MAINNET_API_KEY=your_etherscan_api_key
ETHERSCAN_OPTIMISTIC_API_KEY=your_optimism_api_key
BASESCAN_API_KEY=your_basescan_api_key
ARBISCAN_API_KEY=your_arbiscan_api_key
POLYGONSCAN_API_KEY=your_polygonscan_api_key
```

You can obtain these API keys by creating accounts on the respective block explorers.

## Manual Verification

If automatic verification fails or you need to verify a contract manually, use the following command:

```bash
npx hardhat verify --network <NETWORK_NAME> <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

For example:

```bash
npx hardhat verify --network arbitrum 0x1234567890123456789012345678901234567890 "0xabcdef..." "0x123456..." "0"
```

## Troubleshooting

If verification fails, common issues include:

1. **Block explorer hasn't indexed the contract yet** - Wait a few minutes and try again
2. **Incorrect API key** - Double-check your API keys in the `.env` file
3. **Constructor arguments mismatch** - Ensure the constructor arguments match exactly what was used during deployment
4. **Contract already verified** - This is not an error; your contract is already verified

## Adding New Networks

To add support for a new network:

1. Add the network configuration in `hardhat.config.ts`
2. Add the appropriate API key to your environment variables
3. Configure the verification settings for the network

For more information, see the [Hardhat documentation](https://hardhat.org/plugins/nomiclabs-hardhat-etherscan.html). 
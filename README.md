# 🏦 Kapan Finance

<h4 align="center">
  <a href="https://kapan.finance">Website</a> |
  <a href="https://kapan.finance/app">App</a> |
  <a href="https://kapan.finance/info">Documentation</a>
</h4>

🔄 A DeFi protocol that optimizes borrowing costs by allowing users to seamlessly move debt positions between lending platforms like Aave, Compound, and Venus across multiple chains including Arbitrum and BNB Chain.

⚙️ Built using NextJS, RainbowKit, Hardhat, Wagmi, Viem, and Typescript.

- 💰 **Interest Rate Optimization**: Move your debt to platforms with lower interest rates.
- 🔄 **One-Click Transfers**: Seamlessly transfer debt between lending protocols with a single transaction.
- 📊 **Real-time Comparisons**: Instantly see potential savings by comparing rates between protocols.
- 🧮 **Automatic Calculations**: Built-in calculator shows exactly how much you can save yearly.
- 🔐 **Secure & Non-custodial**: Your assets always remain in your control.
- 🌉 **Cross-Chain Support**: Optimize debt across different blockchains.

![Kapan Finance Dashboard](https://kapan.finance/dashboard-preview.png)

## Overview

Kapan Finance enables DeFi users to optimize their borrowing costs by easily moving debt positions between lending protocols. By comparing interest rates and facilitating seamless transfers, users can save significantly on their annual borrowing costs without complex manual processes.

## Supported Protocols

Kapan currently supports the following lending protocols:

- **Aave V3** (Arbitrum)
- **Compound V3** (Arbitrum)
- **Venus** (Arbitrum)

## How It Works

1. **Connect Wallet**: Connect your Web3 wallet to view your current debt positions and potential savings opportunities.
2. **Choose Position**: Select which debt position to optimize and instantly see available interest rate savings.
3. **Move Debt**: Execute a single transaction to move your debt to the protocol with better rates.

## Features

- **Protocol Comparison**: Real-time comparison of interest rates between Aave, Compound, and Venus.
- **Savings Calculation**: Automatic calculation of potential annual savings based on your debt amount.
- **One-Click Debt Transfers**: Seamlessly move your debt between protocols with a single transaction.
- **User-Friendly Interface**: Clean, intuitive interface that makes DeFi optimization accessible to everyone.
- **Multi-Asset Support**: Support for various assets like USDC, ETH, and more.
- **Cross-Chain Integration**: Support for multiple blockchains (Arbitrum, BNB Chain).

## Requirements

Before you begin, you need to install the following tools:

- [Node (>= v18.18)](https://nodejs.org/en/download/)
- Yarn ([v1](https://classic.yarnpkg.com/en/docs/install/) or [v2+](https://yarnpkg.com/getting-started/install))
- [Git](https://git-scm.com/downloads)

## Development Setup

To get started with Kapan Finance development, follow the steps below:

1. Install dependencies:

```
yarn install
```

2. Run a local network:

```
yarn chain
```

3. Deploy the contracts:

```
yarn deploy
```

4. Start the NextJS app:

```
yarn start
```

Visit your app on: `http://localhost:3000`

## Contributing

We welcome contributions to Kapan Finance!

Please see [CONTRIBUTING.MD](CONTRIBUTING.md) for more information and guidelines for contributing to Kapan Finance.
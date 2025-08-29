import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  ledgerWallet,
  metaMaskWallet,
  rainbowWallet,
  safeWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { rainbowkitBurnerWallet } from "burner-connector";
import * as chains from "viem/chains";
import scaffoldConfig from "~~/scaffold.config";

const { onlyLocalBurnerWallet, targetEVMNetworks: targetNetworks } = scaffoldConfig;

const wallets = [
  metaMaskWallet,
  walletConnectWallet,
  ledgerWallet,
  coinbaseWallet,
  rainbowWallet,
  safeWallet,
  ...(!targetNetworks.some(network => network.id !== (chains.hardhat as chains.Chain).id) || !onlyLocalBurnerWallet
    ? [rainbowkitBurnerWallet]
    : []),
];

declare global {
  // eslint-disable-next-line no-var
  var wagmiConnectors: ReturnType<typeof connectorsForWallets> | undefined;
}

/**
 * Returns wagmi connectors, initializing them only once.
 */
export function getWagmiConnectors() {
  if (!globalThis.wagmiConnectors) {
    globalThis.wagmiConnectors = connectorsForWallets(
      [
        {
          groupName: "Supported Wallets",
          wallets,
        },
      ],
      { appName: "scaffold-eth-2", projectId: scaffoldConfig.walletConnectProjectId },
    );
  }

  return globalThis.wagmiConnectors;
}

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
import { type Chain, hardhat } from "viem/chains";
import scaffoldConfig from "~~/scaffold.config";
import { type CreateConnectorFn } from "wagmi";
import { safe } from "wagmi/connectors";

const { onlyLocalBurnerWallet, targetEVMNetworks: targetNetworks } = scaffoldConfig;

const wallets = [
  metaMaskWallet,
  walletConnectWallet,
  ledgerWallet,
  coinbaseWallet,
  rainbowWallet,
  safeWallet,
  ...(!targetNetworks.some(network => network.id !== (hardhat as Chain).id) || !onlyLocalBurnerWallet
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
  if (typeof window === "undefined") {
    return [] as ReturnType<typeof connectorsForWallets>;
  }

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

  const safeConnector: CreateConnectorFn = safe({
    allowedDomains: [/\.safe\.global$/, /gnosis-safe\.io$/],
    debug: false,
  });

  return [safeConnector, ...globalThis.wagmiConnectors];
}

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  ledgerWallet,
  metaMaskWallet,
  phantomWallet,
  rabbyWallet,
  rainbowWallet,
  safeWallet,
  trustWallet,
  walletConnectWallet,
  zerionWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { rainbowkitBurnerWallet } from "burner-connector";
import { type Chain, hardhat } from "viem/chains";
import { type CreateConnectorFn } from "wagmi";
import { safe } from "wagmi/connectors";
import scaffoldConfig from "~~/scaffold.config";

const { onlyLocalBurnerWallet, targetEVMNetworks: targetNetworks } = scaffoldConfig;

const showBurnerWallet =
  !onlyLocalBurnerWallet || targetNetworks.every(network => network.id === (hardhat as Chain).id);

const walletGroups = [
  {
    groupName: "Popular wallets",
    wallets: [rabbyWallet, metaMaskWallet, coinbaseWallet, rainbowWallet, phantomWallet],
  },
  {
    groupName: "More wallets",
    wallets: [trustWallet, zerionWallet, ledgerWallet, safeWallet, walletConnectWallet, injectedWallet],
  },
  ...(showBurnerWallet ? [{ groupName: "Development", wallets: [rainbowkitBurnerWallet] }] : []),
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
    globalThis.wagmiConnectors = connectorsForWallets(walletGroups, {
      appName: "Kapan Finance",
      appDescription: "Compare lending markets and manage your DeFi positions.",
      appUrl: "https://kapan.finance",
      projectId: scaffoldConfig.walletConnectProjectId,
    });
  }

  const safeConnector: CreateConnectorFn = safe({
    allowedDomains: [/\.safe\.global$/, /gnosis-safe\.io$/],
    debug: false,
  });

  return [safeConnector, ...globalThis.wagmiConnectors];
}

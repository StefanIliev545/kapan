# EVM wallet connection

External wallets use RainbowKit and Wagmi. Installed extensions are discovered through EIP-6963; the picker also lists Rabby, MetaMask, Coinbase, Rainbow, Phantom, Trust, Zerion, Ledger, Safe and WalletConnect. Safe iframe support and the local-development burner remain available. Starknet keeps its separate connection flow.

## Enable email wallets

Email wallets are optional. Without `NEXT_PUBLIC_PRIVY_APP_ID`, the Privy SDK is not loaded and the app uses ordinary external-wallet connections.

1. Create a Privy app at <https://dashboard.privy.io> and enable email login and Ethereum embedded wallets.
2. Allow the exact origins used by Kapan, including `https://kapan.finance`, `https://app.kapan.finance`, and the Vercel previews or localhost origins you intend to test.
3. Set `NEXT_PUBLIC_PRIVY_APP_ID` in the frontend's environment (Vercel or `packages/nextjs/.env.local`), then rebuild. This is a public App ID; an app secret must never be put in a `NEXT_PUBLIC_` variable.
4. Check email delivery, sign-in, sign-out, refresh/reconnection and an empty wallet on a preview before enabling it in production. No live email login or transaction was verified without an app configuration.

The header's **Email** action opens Privy's email flow. It creates or recovers an embedded EVM wallet; it does not import the balances of an existing extension wallet. The account menu labels it **Email wallet**, provides Privy's wallet-export UI, and signs out through Privy. Transaction and signature confirmations remain enabled.

## Connection ownership

Exactly one Wagmi provider owns the active EVM account:

- External sessions use `services/web3/wagmiConfig.tsx`, RainbowKit and EIP-6963 discovery.
- Authenticated email sessions use `@privy-io/wagmi` and select only Privy's embedded wallet. External wallets linked to the Privy user are not silently substituted.

Email and external connection storage are separate. Finishing email login and signing out clear remembered external connections, preventing a stale extension account from reappearing. Cancelling email login leaves the current external connection alone.

Both configurations share `evmChains.ts`, the RPC client factory and the existing application QueryClient. Transaction helpers obtain the active configuration with `useConfig`; they must not import the external singleton. Starknet and its account provider remain outside the EVM ownership switch.

Privy's official integration manages its connector state and does not support disconnecting it through Wagmi's `useDisconnect`. Use `useEvmDisconnect` in shared EVM account controls. Do not add a second connection manager or activate both providers together.

## Checks

The focused tests cover the wallet list, installed-wallet discovery, exclusive provider ownership, embedded-wallet selection, shared cache, delayed reconnect, multiple remembered connections, sign-out, and missing configuration. The external providers are mocked only in lifecycle unit tests; these do not establish delivery of email codes or successful signing on a live Privy app.

Integration reference: <https://docs.privy.io/wallets/connectors/ethereum/integrations/wagmi>.

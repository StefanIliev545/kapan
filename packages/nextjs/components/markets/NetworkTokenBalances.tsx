"use client";

import { FC, useMemo } from "react";
import Image from "next/image";
import { useAccount as useEvmAccount } from "wagmi";
import { base, arbitrum, linea, optimism } from "wagmi/chains";
import Spinner from "~~/components/common/Spinner";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { getTokenNameFallback } from "~~/contracts/tokenNameFallbacks";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useAccount as useStarknetAccount } from "~~/hooks/useAccount";
import { normalizeAddress, useWalletTokenBalances } from "~~/hooks/useWalletTokenBalances";
import { ContractResponse } from "~~/components/specific/vesu/VesuMarkets";
import { feltToString } from "~~/utils/protocols";
import { formatUnits } from "viem";
import { universalEthAddress, universalStrkAddress } from "~~/utils/Constants";

type NetworkId = "base" | "arbitrum" | "optimism" | "linea" | "starknet";

type TokenDisplay = {
  address: string;
  symbol: string;
  decimals?: number;
  icon: string;
};

const NETWORK_CHAIN_IDS: Record<Exclude<NetworkId, "starknet">, number> = {
  base: base.id,
  arbitrum: arbitrum.id,
  optimism: optimism.id,
  linea: linea.id,
};

const NETWORK_LABELS: Record<NetworkId, string> = {
  base: "Base",
  arbitrum: "Arbitrum",
  optimism: "Optimism",
  linea: "Linea",
  starknet: "Starknet",
};

const formatBalance = (balance: bigint, decimals: number): string => {
  try {
    const parsed = Number(formatUnits(balance, decimals));
    if (parsed === 0) return "0";
    if (parsed < 0.01) return parsed.toExponential(2);
    return parsed.toLocaleString(undefined, { maximumFractionDigits: 4 });
  } catch (error) {
    console.error("Failed to format balance", error);
    return "0";
  }
};

const dedupeTokens = (tokens: TokenDisplay[]): TokenDisplay[] => {
  const seen = new Set<string>();
  return tokens.filter(token => {
    const key = normalizeAddress(token.address);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const NetworkTokenBalances: FC<{
  networkId: NetworkId;
  supportedStarknetAssets?: ContractResponse;
}> = ({ networkId, supportedStarknetAssets }) => {
  const { address: evmAddress } = useEvmAccount();
  const { address: starknetAddress } = useStarknetAccount();

  const evmChainId = NETWORK_CHAIN_IDS[networkId as Exclude<NetworkId, "starknet">] ?? base.id;

  const { data: weth } = useDeployedContractInfo({ contractName: "eth", chainId: evmChainId as any });
  const { data: usdc } = useDeployedContractInfo({ contractName: "USDC", chainId: evmChainId as any });
  const { data: usdt } = useDeployedContractInfo({ contractName: "USDT", chainId: evmChainId as any });
  const { data: usdce } = useDeployedContractInfo({ contractName: "USDCe", chainId: evmChainId as any });

  const tokens: TokenDisplay[] = useMemo(() => {
    if (networkId === "starknet") {
      const baseTokens: TokenDisplay[] = [
        { address: universalStrkAddress, symbol: "STRK", decimals: 18, icon: tokenNameToLogo("strk") },
        { address: universalEthAddress, symbol: "ETH", decimals: 18, icon: tokenNameToLogo("eth") },
      ];

      const vesuTokens = (supportedStarknetAssets ?? []).map(asset => {
        const address = `0x${BigInt(asset.address).toString(16).padStart(64, "0")}`;
        const symbolRaw = typeof (asset as any).symbol === "bigint" ? feltToString((asset as any).symbol) : String((asset as any).symbol ?? "");
        const symbol = symbolRaw && symbolRaw.trim().length > 0 ? symbolRaw : getTokenNameFallback(address) ?? symbolRaw;
        return {
          address,
          symbol,
          decimals: asset.decimals,
          icon: tokenNameToLogo(symbol.toLowerCase()),
        } satisfies TokenDisplay;
      });

      return dedupeTokens([...baseTokens, ...vesuTokens]);
    }

    const evmTokens: TokenDisplay[] = [];

    if (weth?.address)
      evmTokens.push({ address: weth.address, symbol: "ETH", decimals: 18, icon: tokenNameToLogo("eth") });
    if (usdc?.address)
      evmTokens.push({ address: usdc.address, symbol: "USDC", decimals: 6, icon: tokenNameToLogo("usdc") });
    if (usdt?.address)
      evmTokens.push({ address: usdt.address, symbol: "USDT", decimals: 6, icon: tokenNameToLogo("usdt") });
    if (usdce?.address)
      evmTokens.push({ address: usdce.address, symbol: "USDC.e", decimals: 6, icon: tokenNameToLogo("usdc") });

    return dedupeTokens(evmTokens);
  }, [networkId, supportedStarknetAssets, usdce?.address, usdc?.address, usdt?.address, weth?.address]);

  const networkType = networkId === "starknet" ? "starknet" : "evm";
  const walletAddress = networkType === "evm" ? evmAddress : starknetAddress;

  const { balances, isLoading } = useWalletTokenBalances({
    tokens,
    network: networkType,
    chainId: networkType === "evm" ? evmChainId : undefined,
  });

  const hasWallet = Boolean(walletAddress);

  return (
    <div className="rounded-2xl border border-base-200/70 bg-base-100/80 shadow-sm">
      <div className="flex items-center justify-between border-b border-base-200/70 px-5 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-base-content/40">Wallet Balances</p>
          <p className="font-semibold text-base-content">{NETWORK_LABELS[networkId]} Tokens</p>
        </div>
        <div className="text-right text-xs text-base-content/50">
          {hasWallet ? (
            <span className="font-mono text-[11px]">
              {walletAddress?.slice(0, 6)}…{walletAddress?.slice(-4)}
            </span>
          ) : (
            <span>Connect a wallet to view balances</span>
          )}
        </div>
      </div>

      <div className="p-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-base-content/60">
            <Spinner size="loading-sm" />
            <span>Fetching balances…</span>
          </div>
        )}

        {!isLoading && tokens.length === 0 && (
          <div className="text-sm text-base-content/60">No tokens configured for this network yet.</div>
        )}

        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {tokens.map(token => {
            const key = normalizeAddress(token.address);
            const balanceInfo = balances[key];
            const decimals = balanceInfo?.decimals ?? token.decimals ?? 18;
            const balance = balanceInfo?.balance ?? 0n;
            const formatted = formatBalance(balance, decimals);

            return (
              <div
                key={`${token.address}-${token.symbol}`}
                className="rounded-xl border border-base-200/70 bg-base-200/40 p-3 hover:border-base-300 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="relative h-8 w-8 overflow-hidden rounded-full bg-base-300/60">
                    <Image src={token.icon} alt={token.symbol} fill className="object-contain" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">{token.symbol}</p>
                    <p className="text-[11px] font-mono text-base-content/50 break-all">{token.address.slice(0, 10)}…</p>
                  </div>
                </div>

                <div className="mt-3 text-right">
                  <p className="text-lg font-bold leading-tight">{formatted}</p>
                  <p className="text-xs text-base-content/50">{decimals}-decimals</p>
                </div>
              </div>
            );
          })}
        </div>

        {!isLoading && hasWallet && tokens.every(t => (balances[normalizeAddress(t.address)]?.balance ?? 0n) === 0n) && (
          <p className="mt-4 text-sm text-base-content/50">No balances detected for the selected wallet on this network.</p>
        )}
      </div>
    </div>
  );
};

export default NetworkTokenBalances;

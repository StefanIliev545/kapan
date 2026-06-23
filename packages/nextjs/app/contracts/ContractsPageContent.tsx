"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowTopRightOnSquareIcon, CheckIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import deployedContracts from "~~/contracts/deployedContracts";
import { getBlockExplorerAddressLink, getChainById } from "~~/utils/scaffold-eth/networks";

const HARDHAT_ID = 31337;

type ContractMap = Record<number, Record<string, { address: string }>>;

export default function ContractsPageContent() {
  // Networks that have deployments AND a known EVM chain (name + explorer). Hardhat/localhost and
  // Starknet (different address/explorer model) are excluded for now.
  const chainIds = useMemo(
    () =>
      Object.keys(deployedContracts as ContractMap)
        .map(Number)
        .filter(id => !Number.isNaN(id) && id !== HARDHAT_ID && !!getChainById(id))
        .filter(id => Object.keys((deployedContracts as ContractMap)[id] ?? {}).length > 0)
        .sort((a, b) => (getChainById(a)?.name ?? "").localeCompare(getChainById(b)?.name ?? "")),
    [],
  );

  const [selected, setSelected] = useState<number>(
    () => [1, 42161, 8453, 10, 59144].find(id => chainIds.includes(id)) ?? chainIds[0],
  );
  const [copied, setCopied] = useState<string | null>(null);

  const chain = getChainById(selected);
  const rows = useMemo(() => {
    const set = (deployedContracts as ContractMap)[selected] ?? {};
    return Object.entries(set)
      .map(([name, c]) => ({ name, address: c.address }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [selected]);

  const copy = useCallback((addr: string) => {
    navigator.clipboard?.writeText(addr).then(() => {
      setCopied(addr);
      setTimeout(() => setCopied(c => (c === addr ? null : c)), 1500);
    });
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Deployed contracts</h1>
      <p className="text-base-content/70 mt-2 leading-relaxed">Kapan&apos;s on-chain contract addresses, by network.</p>

      <div className="mt-6 flex items-center gap-3">
        <label htmlFor="contracts-network" className="text-base-content/60 text-xs uppercase tracking-wider">
          Network
        </label>
        <select
          id="contracts-network"
          value={selected}
          onChange={e => setSelected(Number(e.target.value))}
          className="bg-base-200 border-base-300 text-base-content focus:border-accent border px-3 py-2 text-sm outline-none transition-colors"
        >
          {chainIds.map(id => (
            <option key={id} value={id}>
              {getChainById(id)?.name ?? `Chain ${id}`}
            </option>
          ))}
        </select>
      </div>

      <div className="card-surface mt-5 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th scope="col" className="market-th px-4">Contract</th>
              <th scope="col" className="market-th px-4">Address</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const link = chain ? getBlockExplorerAddressLink(chain, row.address) : "";
              return (
                <tr key={row.name} className="market-row">
                  <td className="market-td whitespace-nowrap px-4 font-medium">{row.name}</td>
                  <td className="market-td px-4">
                    <div className="flex items-center gap-2">
                      {link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-base-content/80 hover:text-primary inline-flex items-center gap-1 break-all font-mono text-xs transition-colors"
                        >
                          {row.address}
                          <ArrowTopRightOnSquareIcon className="size-3.5 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-base-content/80 break-all font-mono text-xs">{row.address}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => copy(row.address)}
                        aria-label={`Copy ${row.name} address`}
                        className="text-base-content/40 hover:text-base-content shrink-0 transition-colors"
                      >
                        {copied === row.address ? (
                          <CheckIcon className="text-success size-3.5" />
                        ) : (
                          <ClipboardIcon className="size-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-base-content/50 mt-8 text-xs">
        EVM networks only for now — Starknet (Nostra/Vesu) deployments use a different address format and explorer.
      </p>
    </div>
  );
}

"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import type { NextPage } from "next";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { MarketsGrouped } from "~~/components/markets/MarketsGrouped";
import StableArea from "~~/components/common/StableArea";
import { createTextChangeHandler } from "~~/utils/handlers";
import { type TokenCategory, TOKEN_CATEGORIES, TOKEN_CATEGORY_ORDER } from "~~/utils/tokenCategories";

const MARKET_NETWORKS = [
  { id: "all", name: "All" },
  { id: "ethereum", name: "Ethereum", logo: "/logos/ethereum.svg" },
  { id: "arbitrum", name: "Arbitrum", logo: "/logos/arb.svg" },
  { id: "base", name: "Base", logo: "/logos/base.svg" },
  { id: "optimism", name: "Optimism", logo: "/logos/optimism.svg" },
  { id: "linea", name: "Linea", logo: "/logos/linea.svg" },
  { id: "starknet", name: "Starknet", logo: "/logos/starknet.svg" },
] as const;

const MarketsPageContent: NextPage = () => {
  const [search, setSearch] = useState("");
  const [network, setNetwork] = useState("all");
  const [category, setCategory] = useState<TokenCategory>("all");
  const handleNetwork = useCallback((id: string) => setNetwork(id), []);
  const handleCategory = useCallback((c: TokenCategory) => setCategory(c), []);
  const handleClearSearch = useCallback(() => setSearch(""), []);

  return (
    <div className="container mx-auto min-h-[calc(100vh-6rem)] px-5 py-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Page Header */}
        <div className="mb-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Markets</h1>
              <p className="text-base-content/50 mt-0.5 text-sm">Compare rates across protocols</p>
            </div>
          </div>

          {/* Controls: Search + Network Filter */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <div className="group/search relative max-w-xs flex-1">
              <MagnifyingGlassIcon className="text-base-content/40 group-focus-within/search:text-base-content/70 pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 transition-colors" />
              <input
                type="text"
                placeholder="Search tokens…"
                className="bg-base-content/[0.04] border-base-content/[0.08] focus:border-base-content/20 focus:bg-base-content/[0.06] placeholder:text-base-content/30 w-full border py-2.5 pl-10 pr-9 text-sm transition-all focus:outline-none"
                value={search}
                onChange={createTextChangeHandler(setSearch)}
              />
              {search && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                  className="text-base-content/40 hover:text-base-content/80 absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                >
                  <XMarkIcon className="size-4" />
                </button>
              )}
            </div>

            {/* Token-type Filter */}
            <div className="bg-base-content/[0.03] flex items-center gap-0.5 border border-base-content/[0.05] p-0.5">
              {TOKEN_CATEGORY_ORDER.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleCategory(c)}
                  className={`px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-all duration-200 ${
                    category === c
                      ? "bg-base-content/10 text-base-content"
                      : "text-base-content/35 hover:text-base-content/60"
                  }`}
                >
                  {TOKEN_CATEGORIES[c].label}
                </button>
              ))}
            </div>

            {/* Network Filter */}
            <div className="bg-base-content/[0.03] flex items-center gap-0.5 border border-base-content/[0.05] p-0.5">
              {MARKET_NETWORKS.map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleNetwork(n.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-all duration-200 ${
                    network === n.id
                      ? "bg-base-content/10 text-base-content"
                      : "text-base-content/35 hover:text-base-content/60"
                  }`}
                >
                  {"logo" in n && n.logo && (
                    <div className="relative size-3">
                      <Image src={n.logo} alt={n.name} fill className="object-contain" />
                    </div>
                  )}
                  <span>{n.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <StableArea as="section" minHeight="32rem" innerClassName="h-full">
          <MarketsGrouped search={search} network={network} category={category} />
        </StableArea>
      </div>
    </div>
  );
};

export default MarketsPageContent;

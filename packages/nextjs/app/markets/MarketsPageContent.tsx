"use client";

import { useState } from "react";
import type { NextPage } from "next";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { MarketsGrouped } from "~~/components/markets/MarketsGrouped";
import StableArea from "~~/components/common/StableArea";
import { createTextChangeHandler } from "~~/utils/handlers";

const MarketsPageContent: NextPage = () => {
  const [search, setSearch] = useState("");

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

          {/* Search */}
          <div className="max-w-md">
            <div className="relative">
              <MagnifyingGlassIcon className="text-base-content/40 pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search tokens..."
                className="bg-base-content/[0.03] border border-base-content/[0.06] focus:border-base-content/15 placeholder:text-base-content/25 w-full py-2 pl-10 pr-4 text-sm transition-all focus:outline-none"
                value={search}
                onChange={createTextChangeHandler(setSearch)}
              />
            </div>
          </div>
        </div>

        <StableArea as="section" minHeight="32rem" innerClassName="h-full">
          <MarketsGrouped search={search} />
        </StableArea>
      </div>
    </div>
  );
};

export default MarketsPageContent;

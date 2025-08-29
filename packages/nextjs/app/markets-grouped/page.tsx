"use client";

import type { NextPage } from "next";
import { LendingSidebar } from "~~/components/LendingSidebar";
import { MarketsGrouped } from "~~/components/markets/MarketsGrouped";

const MarketsGroupedPage: NextPage = () => {
  return (
    <div className="container mx-auto px-5 flex">
      <LendingSidebar />
      <div className="flex-1">
        <MarketsGrouped />
      </div>
    </div>
  );
};

export default MarketsGroupedPage;

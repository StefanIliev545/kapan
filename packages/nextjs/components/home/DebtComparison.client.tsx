"use client";

import dynamic from "next/dynamic";
import Spinner from "../common/Spinner";

const DebtComparison = dynamic(() => import("./DebtComparison"), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center py-8">
      <Spinner size="loading-lg" />
    </div>
  ),
});

export default DebtComparison;

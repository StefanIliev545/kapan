"use client";

import dynamic from "next/dynamic";

const TransactionFeed = dynamic(() => import("./TransactionFeed"), {
  ssr: false,
  loading: () => null,
});

export default TransactionFeed;

"use client";

import type { NextPage } from "next";
import { AaveProtocolView } from "~~/components/specific/aave/AaveProtocolView";
import { CompoundProtocolView } from "~~/components/specific/compound/CompoundProtocolView";

const Home: NextPage = () => {
  return (
    <>
      <AaveProtocolView />
      <CompoundProtocolView />
    </>
  );
};

export default Home;

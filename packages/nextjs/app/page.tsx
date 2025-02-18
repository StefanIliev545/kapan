"use client";

import type { NextPage } from "next";
import { AaveProtocolView } from "~~/components/specific/aave/AaveProtocolView";
import { CompoundProtocolView } from "~~/components/specific/compound/CompoundProtocolView";

const Home: NextPage = () => {
  return (
    <div className="container mx-auto px-5">
      <AaveProtocolView />
      <CompoundProtocolView />
    </div>
  );
};

export default Home;

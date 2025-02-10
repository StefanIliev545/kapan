"use client";

import type { NextPage } from "next";
import { AaveProtocolView } from "~~/components/specific/aave/AaveProtocolView";
import { CompoundProtocolView } from "~~/components/specific/compound/CompoundProtocolView";

const Home: NextPage = () => {
  return (
    <>
      <div className="flex items-center flex-col flex-grow pt-10">
        <AaveProtocolView />
        <CompoundProtocolView />
      </div>
    </>
  );
};

export default Home;

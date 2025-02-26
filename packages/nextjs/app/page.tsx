"use client";

import type { NextPage } from "next";
import { AaveProtocolView } from "~~/components/specific/aave/AaveProtocolView";
import { CompoundProtocolView } from "~~/components/specific/compound/CompoundProtocolView";

const Home: NextPage = () => {
  return (
    <div className="container mx-auto px-5">
      {/* Alpha Version Disclaimer */}
      <div className="my-8 p-4 border-2 border-warning bg-warning bg-opacity-10 rounded-lg">
        <h2 className="text-xl font-bold text-warning mb-2">Alpha Version</h2>
        <p className="text-warning">
          This application is in <span className="font-bold">ALPHA</span> version. Features may be unstable, and 
          using the app involves risks. Use at your own risk. You can view the current light tests and smart contracts
          on github for more information.
        </p>
      </div>
      
      <AaveProtocolView />
      <CompoundProtocolView />
    </div>
  );
};

export default Home;

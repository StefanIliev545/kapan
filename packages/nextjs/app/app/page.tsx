"use client";

import type { NextPage } from "next";
import { AaveProtocolView } from "~~/components/specific/aave/AaveProtocolView";
import { CompoundProtocolView } from "~~/components/specific/compound/CompoundProtocolView";
import { VenusProtocolView } from "~~/components/specific/venus/VenusProtocolView";
import AlphaWarning from "~~/components/home/AlphaWarning";

const App: NextPage = () => {
  return (
    <div className="container mx-auto px-5">
      {/* Alpha Version Disclaimer */}
      <AlphaWarning />
      <AaveProtocolView />
      <CompoundProtocolView />
      <VenusProtocolView />
    </div>
  );
};

export default App;

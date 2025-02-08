"use client";

import type { NextPage } from "next";
import { ExampleProtocolView } from "~~/components/ProtocolView";
import { CompoundProtocolView } from "~~/components/specific/compound/CompoundProtocolView";
const Home: NextPage = () => {
  return (
    <>
      <div className="flex items-center flex-col flex-grow pt-10">
        <ExampleProtocolView />
        <CompoundProtocolView />
      </div>
    </>
  );
};

export default Home;

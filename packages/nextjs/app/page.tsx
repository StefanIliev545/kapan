"use client";

import type { NextPage } from "next";
import { ExampleProtocolView } from "~~/components/ProtocolView";

const Home: NextPage = () => {
  return (
    <>
      <div className="flex items-center flex-col flex-grow pt-10">
        <ExampleProtocolView />
      </div>
    </>
  );
};

export default Home;

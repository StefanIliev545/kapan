"use client";

import { Box, Flex, Heading } from "@radix-ui/themes";
import ProtocolCycle from "../ProtocolCycle";
import { Tabs } from "radix-ui";
import { KTabsList, KTabsTrigger } from "../ui/KTabs";
import TabHeading from "../ui/TabHeading";
import OverviewDemo from "./explainer/OverviewDemo";
import LendDemo from "./explainer/LendDemo";
import BorrowDemo from "./explainer/BorrowDemo";
import SwapDemo from "./explainer/SwapDemo";
import RefinanceDemo from "./explainer/RefinanceDemo";

const ExplainerSection = () => {
  return (
    <section className="w-full py-10 md:py-16 bg-gradient-to-b from-base-200 to-base-100 dark:from-base-300 dark:to-base-200 min-h-[70svh] md:min-h-[85svh] lg:min-h-screen flex items-center">
      <div className="container mx-auto px-5 text-center w-full">
        <div className="mx-auto w-full max-w-7xl">
        <Heading as="h2" size="8" weight="bold" className="font-display mb-3 text-base-content">
          Meet Kapan
        </Heading>
        <p className="text-lg md:text-xl text-base-content/80 max-w-2xl mx-auto flex items-center justify-center gap-2">
          <span>Interact with</span>
          <ProtocolCycle minWidthCh={11} className="h-7 md:h-8" />
        </p>
        <Tabs.Root defaultValue="overview">
            <Flex direction="column" gap="3" pb="2" className="w-full">
                <KTabsList className="px-4">
                    <KTabsTrigger value="overview">Overview</KTabsTrigger>
                    <KTabsTrigger value="lend">Lend</KTabsTrigger>
                    <KTabsTrigger value="borrow">Borrow</KTabsTrigger>
                    <KTabsTrigger value="swap">Swap</KTabsTrigger>
                    <KTabsTrigger value="refinance">Refinance</KTabsTrigger>
                </KTabsList>
            </Flex>
            <Box pt="5" className="pt-6 md:pt-8">
            <Tabs.Content value="overview" className="pt-4 md:pt-6">
                <TabHeading>View all your lending positions and compare interest rates across protocols in the same place.</TabHeading>
                <OverviewDemo />
            </Tabs.Content>
            <Tabs.Content value="lend" className="pt-4 md:pt-6">
                <TabHeading>Lend your assets to earn interest across various protocols.</TabHeading>
                <LendDemo />
            </Tabs.Content>
            <Tabs.Content value="borrow" className="pt-4 md:pt-6">
                <TabHeading>Borrow and Repay to effectively manage your LTV and create strategies.</TabHeading>
                <BorrowDemo />
            </Tabs.Content>
            <Tabs.Content value="swap" className="pt-4 md:pt-6">
                <TabHeading>Swap your assets between various protocols to get the best rates.</TabHeading>
                <SwapDemo />
            </Tabs.Content>
            <Tabs.Content value="refinance" className="pt-4 md:pt-6">
                <TabHeading>Automate refinancing across protocols to optimize rates.</TabHeading>
                <RefinanceDemo />
            </Tabs.Content>
            </Box>
        </Tabs.Root>
        </div>
    </div>
    </section>
  );
};

export default ExplainerSection;



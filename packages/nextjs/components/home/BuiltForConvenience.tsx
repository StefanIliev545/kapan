"use client";

import { Heading, Flex, Text, Box } from "@radix-ui/themes";
import * as Accordion from "@radix-ui/react-accordion";
import { motion } from "framer-motion";
import { ChevronRightIcon } from "@heroicons/react/24/solid";

const BuiltForConvenience = () => {
  return (
    <section className="w-full py-10 md:py-16 bg-base-100 dark:bg-gradient-to-b dark:from-base-200 dark:to-base-300">
      <div className="container mx-auto px-5">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="max-w-5xl mx-auto text-left"
        >
          <Heading as="h2" size="7" weight="bold" className="mb-3">Built for Convenience</Heading>

          <Accordion.Root type="single" collapsible defaultValue="gas" className="space-y-2">
            {/* Gas token */}
            <Accordion.Item value="gas" className="group">
              <Accordion.Trigger
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-left hover:bg-base-200/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <Heading as="h3" size="4" weight="medium">Pay with any gas token</Heading>
                <ChevronRightIcon className="h-4 w-4 text-base-content/70 transition-transform group-data-[state=open]:rotate-90" />
              </Accordion.Trigger>
              <Accordion.Content asChild>
                <motion.div
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="px-4 pb-4"
                >
                  <Text size="3" color="gray">
                    Kapan has integrated AVNU Paymaster and supports a plethora of gas tokens, allowing you to pay in
                    the token of your choice regardless of the protocol you intend to use.
                  </Text>
                </motion.div>
              </Accordion.Content>
            </Accordion.Item>

            {/* Cartridge */}
            <Accordion.Item value="cartridge" className="group">
              <Accordion.Trigger className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-left hover:bg-base-200/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                <Heading as="h3" size="4" weight="medium">Integration with Cartridge Controller</Heading>
                <ChevronRightIcon className="h-4 w-4 text-base-content/70 transition-transform group-data-[state=open]:rotate-90" />
              </Accordion.Trigger>
              <Accordion.Content asChild>
                <motion.div
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="px-4 pb-4"
                >
                  <Text size="3" color="gray">
                    Cartridge Controller has been integrated and support for it will be improved to provide a web2
                    experience whilst using lending.
                  </Text>
                </motion.div>
              </Accordion.Content>
            </Accordion.Item>

            {/* Smart Refinancing */}
            <Accordion.Item value="refi" className="group">
              <Accordion.Trigger className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-left hover:bg-base-200/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                <Heading as="h3" size="4" weight="medium">Smart Refinancing</Heading>
                <ChevronRightIcon className="h-4 w-4 text-base-content/70 transition-transform group-data-[state=open]:rotate-90" />
              </Accordion.Trigger>
              <Accordion.Content asChild>
                <motion.div
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="px-4 pb-4"
                >
                  <Text size="3" color="gray">
                    You can refinance incompatible positions by utilizing a swap in the middle of the process and
                    change assets on the fly. Address‑isolated collateral can be automatically split into pairs when
                    migrating between different lending protocol isolation types.
                  </Text>
                </motion.div>
              </Accordion.Content>
            </Accordion.Item>

            {/* Middleware */}
            <Accordion.Item value="middleware" className="group">
              <Accordion.Trigger className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-left hover:bg-base-200/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                <Heading as="h3" size="4" weight="medium">Non‑Custodial Middleware Approach</Heading>
                <ChevronRightIcon className="h-4 w-4 text-base-content/70 transition-transform group-data-[state=open]:rotate-90" />
              </Accordion.Trigger>
              <Accordion.Content asChild>
                <motion.div
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="px-4 pb-4"
                >
                  <Text size="3" color="gray">
                    Kapan composes lending instructions and sends them to a router which acts on your behalf, resulting
                    in the same final state as interacting directly with the underlying protocol. Kapan&apos;s contracts
                    never take ownership of your assets; after each operation you can verify balances on the
                    protocol&apos;s own front end under your account.
                  </Text>
                </motion.div>
              </Accordion.Content>
            </Accordion.Item>

            {/* Fees */}
            <Accordion.Item value="fees" className="group">
              <Accordion.Trigger className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-left hover:bg-base-200/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                <Heading as="h3" size="4" weight="medium">No Fees</Heading>
                <ChevronRightIcon className="h-4 w-4 text-base-content/70 transition-transform group-data-[state=open]:rotate-90" />
              </Accordion.Trigger>
              <Accordion.Content asChild>
                <motion.div
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="px-4 pb-4"
                >
                  <Text size="3" color="gray">
                    Kapan requires no protocol liquidity as it utilizes flash loans, so there are no additional
                    protocol fees. You only pay network gas, and for certain operations, any swap fees involved in the
                    route.
                  </Text>
                </motion.div>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion.Root>
        </motion.div>
      </div>
    </section>
  );
};

export default BuiltForConvenience;



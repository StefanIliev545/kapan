"use client";

import { ReactNode } from "react";

type FaucetProviderErrorProps = {
  providerType: "EVM" | "SN";
};

/**
 * A reusable error notification content for faucet provider connection failures.
 * Used across scaffold-eth and scaffold-stark Faucet components.
 *
 * Note: This component returns JSX content to be passed to the notification system.
 * It should not be used as a standalone component.
 */
export const FaucetProviderError = ({ providerType }: FaucetProviderErrorProps): ReactNode => {
  return (
    <>
      <p className="mb-1 mt-0 font-bold">Cannot connect to local {providerType} provider</p>
      <p className="m-0">
        - Did you forget to run <code className="bg-base-300 text-base font-bold italic">yarn chain</code> ?
      </p>
      <p className="mt-1 break-normal">
        - Or you can change <code className="bg-base-300 text-base font-bold italic">targetNetwork</code> in{" "}
        <code className="bg-base-300 text-base font-bold italic">scaffold.config.ts</code>
      </p>
    </>
  );
};

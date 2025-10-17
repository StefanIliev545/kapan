import { fetchBuildExecuteTransaction, fetchQuotes, type Quote } from "@avnu/avnu-sdk";

export const AVNU_SWAP_ENTRYPOINTS = [
  "swap_exact_token_to",
  "multi_route_swap",
  "swap_exact_in",
] as const;

export type AvnuQuoteArgs = {
  chainId: number;
  fromToken: `0x${string}`;
  toToken: `0x${string}`;
  amount: bigint;
  takerAddress: `0x${string}`;
};

export type AvnuQuote = {
  rawQuote: Quote;
  calldata: bigint[];
  minOut: bigint;
};

const toAbortError = () => new DOMException("Aborted", "AbortError");

export async function fetchAvnuQuote(
  args: AvnuQuoteArgs,
  signal?: AbortSignal,
  slippageBps = 30,
): Promise<AvnuQuote> {
  if (signal?.aborted) {
    throw toAbortError();
  }

  const { fromToken, toToken, amount, takerAddress } = args;

  if (!fromToken || !toToken) {
    throw new Error("Missing token addresses for AVNU quote");
  }

  if (!takerAddress) {
    throw new Error("Missing taker address for AVNU quote");
  }

  let abortHandler: (() => void) | undefined;
  const abortPromise = signal
    ? new Promise<never>((_, reject) => {
        abortHandler = () => reject(toAbortError());
        signal.addEventListener("abort", abortHandler!, { once: true });
      })
    : null;

  const run = async () => {
    const quotes = await fetchQuotes({
      sellTokenAddress: fromToken,
      buyTokenAddress: toToken,
      sellAmount: amount,
      takerAddress,
    } as any);

    if (!quotes || quotes.length === 0) {
      throw new Error("No AVNU quote available for selected collateral");
    }

    if (signal?.aborted) {
      throw toAbortError();
    }

    const quote = quotes[0];
    const slippageDecimal = Math.max(slippageBps, 0) / 10_000;
    const tx = await fetchBuildExecuteTransaction(quote.quoteId, takerAddress, slippageDecimal, false);
    const swapCall = tx.calls?.find((call: any) =>
      AVNU_SWAP_ENTRYPOINTS.includes(call.entrypoint as (typeof AVNU_SWAP_ENTRYPOINTS)[number]),
    );

    if (!swapCall) {
      throw new Error("Unable to prepare AVNU swap instruction");
    }

    const calldata = (swapCall.calldata as any[]).map((value: any) => BigInt(value.toString()));
    const buyAmount = BigInt(quote.buyAmount);
    const slippage = BigInt(slippageBps);
    const minOut = buyAmount - (buyAmount * slippage) / 10_000n;

    return {
      rawQuote: quote,
      calldata,
      minOut: minOut > 0n ? minOut : buyAmount,
    };
  };

  try {
    if (!abortPromise) {
      return await run();
    }

    return await Promise.race([run(), abortPromise]);
  } finally {
    if (signal && abortHandler) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}

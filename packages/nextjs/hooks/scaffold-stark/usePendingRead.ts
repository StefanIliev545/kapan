import { useProvider } from "@starknet-react/core";
import { BlockIdentifier, Call } from "starknet";

export const usePendingAwareRead = () => {
  const { provider } = useProvider();
  return (call: Call, blockIdentifier: BlockIdentifier = "latest") =>
    (provider as any).call(call, blockIdentifier);
};

export const usePendingRead = () => {
  const read = usePendingAwareRead();
  return (call: Call) => read(call, "pending");
};


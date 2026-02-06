import { useEffect, useMemo, useState } from "react";
import { useTargetNetwork } from "./useTargetNetwork";
import { useStarkBlockNumber } from "./useBlockNumberContext";
import { Abi, ExtractAbiEvent, ExtractAbiEventNames } from "abi-wan-kanabi/kanabi";
import { RpcProvider, hash } from "starknet";
import { CallData, createAbiParser, events as starknetEvents } from "starknet";
import { useDeployedContractInfo } from "~~/hooks/scaffold-stark";
import { replacer } from "~~/utils/scaffold-stark/common";
import { ContractAbi, ContractName, UseScaffoldEventHistoryConfig } from "~~/utils/scaffold-stark/contract";
import { composeEventFilterKeys } from "~~/utils/scaffold-stark/eventKeyFilter";
import { parseEventData } from "~~/utils/scaffold-stark/eventsData";

const MAX_KEYS_COUNT = 16;

/**
 * Reads events from a deployed contract
 * @param config - The config settings
 * @param config.contractName - deployed contract name
 * @param config.eventName - name of the event to listen for
 * @param config.fromBlock - the block number to start reading events from
 * @param config.filters - filters to be applied to the event (parameterName: value)
 * @param config.blockData - if set to true it will return the block data for each event (default: false)
 * @param config.transactionData - if set to true it will return the transaction data for each event (default: false)
 * @param config.receiptData - if set to true it will return the receipt data for each event (default: false)
 * @param config.watch - if set to true, the events will be refreshed on each new block (default: false)
 * @param config.enabled - if set to false, disable the hook from running (default: true)
 */
export const useScaffoldEventHistory = <
  TContractName extends ContractName,
  TEventName extends ExtractAbiEventNames<ContractAbi<TContractName>>,
  TBlockData extends boolean = false,
  TTransactionData extends boolean = false,
  TReceiptData extends boolean = false,
>({
  contractName,
  eventName,
  fromBlock,
  filters,
  blockData,
  transactionData,
  receiptData,
  watch = false,
  format = true,
  enabled = true,
}: UseScaffoldEventHistoryConfig<TContractName, TEventName, TBlockData, TTransactionData, TReceiptData>) => {
  // Events have dynamic structure based on contract ABI - using any[] for flexibility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [events, setEvents] = useState<any[]>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [fromBlockUpdated, setFromBlockUpdated] = useState<bigint>(fromBlock);

  const { data: deployedContractData, isLoading: deployedContractLoading } = useDeployedContractInfo(contractName);
  const { targetNetwork } = useTargetNetwork();
  const blockNumberCtx = useStarkBlockNumber();

  const publicClient = useMemo(() => {
    return new RpcProvider({
      nodeUrl: targetNetwork.rpcUrls.public.http[0],
    });
  }, [targetNetwork.rpcUrls.public.http]);

  const readEvents = async (fromBlock?: bigint, latestBlock?: bigint) => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      if (deployedContractLoading) {
        return;
      }

      if (!deployedContractData) {
        throw new Error("Contract not found");
      }

      const event = (deployedContractData.abi as Abi).find(
        part => part.type === "event" && part.name === eventName,
      ) as ExtractAbiEvent<ContractAbi<TContractName>, TEventName>;

      const latestBlockNumber =
        latestBlock ??
        (
          await (
            (publicClient as any).getBlockLatestAccepted
              ? (publicClient as any).getBlockLatestAccepted()
              : (publicClient as any).getBlock("latest")
          )
        ).block_number;
      const blockNumber = Number(latestBlockNumber);

      if ((fromBlock && blockNumber >= Number(fromBlock)) || blockNumber >= Number(fromBlockUpdated)) {
        let keys: string[][] = [[hash.getSelectorFromName(event.name.split("::").slice(-1)[0])]];
        if (filters) {
          keys = keys.concat(composeEventFilterKeys(filters, event, deployedContractData.abi));
        }
        keys = keys.slice(0, MAX_KEYS_COUNT);
        const rawEventResp = await publicClient.getEvents({
          chunk_size: 100,
          keys,
          address: deployedContractData?.address,
          from_block: { block_number: Number(fromBlock || fromBlockUpdated) },
          to_block: { block_number: blockNumber },
        });
        if (!rawEventResp) {
          return;
        }
        const logs = rawEventResp.events;
        setFromBlockUpdated(BigInt(blockNumber + 1));

        const newEvents = [];
        for (let i = logs.length - 1; i >= 0; i--) {
          newEvents.push({
            event,
            log: logs[i],
            block:
              blockData && logs[i].block_hash === null
                ? null
                : await publicClient.getBlockWithTxHashes(logs[i].block_hash),
            transaction:
              transactionData && logs[i].transaction_hash !== null
                ? await publicClient.getTransactionByHash(logs[i].transaction_hash)
                : null,
            receipt:
              receiptData && logs[i].transaction_hash !== null
                ? await publicClient.getTransactionReceipt(logs[i].transaction_hash)
                : null,
          });
        }
        if (events && typeof fromBlock === "undefined") {
          setEvents([...newEvents, ...events]);
        } else {
          setEvents(newEvents);
        }
        setError(undefined);
      }
    } catch (error: unknown) {
      console.error(error);
      setEvents(undefined);
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    readEvents(fromBlock, blockNumberCtx).then();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromBlock, enabled, blockNumberCtx]);

  useEffect(() => {
    if (!deployedContractLoading) {
      readEvents(undefined, blockNumberCtx).then();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    contractName,
    eventName,
    deployedContractLoading,
    deployedContractData?.address,
    deployedContractData,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(filters, replacer),
    blockData,
    transactionData,
    receiptData,
  ]);

  useEffect(() => {
    // Reset the internal state when target network or fromBlock changed
    setEvents([]);
    setFromBlockUpdated(fromBlock);
    setError(undefined);
  }, [fromBlock, targetNetwork.id]);

  useEffect(() => {
    if (watch && blockNumberCtx !== undefined && !deployedContractLoading) {
      readEvents(undefined, blockNumberCtx).then();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockNumberCtx, watch, deployedContractLoading]);

  const eventHistoryData = useMemo(() => {
    if (deployedContractData) {
      const abi = deployedContractData.abi as Abi;
      const abiParser = createAbiParser(abi);
      return (events || []).map(event => {
        const logs = [JSON.parse(JSON.stringify(event.log))];
        const parsed = starknetEvents.parseEvents(
          logs,
          starknetEvents.getAbiEvents(abi),
          CallData.getAbiStruct(abi),
          CallData.getAbiEnum(abi),
          abiParser,
        );
        const args = parsed.length ? parsed[0][eventName] : {};
        const { event: rawEvent, ...rest } = event;
        return {
          type: rawEvent.members,
          args,
          parsedArgs: format ? parseEventData(args, rawEvent.members) : null,
          ...rest,
        };
      });
    }
    return [];
  }, [deployedContractData, events, eventName, format]);

  return {
    data: eventHistoryData,
    isLoading: isLoading || deployedContractLoading,
    error: error,
  };
};

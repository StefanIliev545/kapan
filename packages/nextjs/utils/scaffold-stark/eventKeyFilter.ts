import { feltToHex } from "./common";
import { ContractAbi, ContractName } from "./contract";
import { ExtractAbiEvent, ExtractAbiEventNames } from "abi-wan-kanabi/kanabi";
import { Abi, AbiEntry, AbiEnums, AbiStructs, CallData, createAbiParser, parseCalldataField } from "starknet";

const stringToByteArrayFelt = (str: string): string[] => {
  const bytes = new TextEncoder().encode(str);
  const result = [];
  const numFullWords = Math.floor(bytes.length / 31);
  result.push(numFullWords.toString());

  for (let i = 0; i < numFullWords; i++) {
    const chunk = bytes.slice(i * 31, (i + 1) * 31);
    const felt = "0x" + Buffer.from(chunk).toString("hex");
    result.push(felt);
  }

  const remainingBytes = bytes.slice(numFullWords * 31);
  if (remainingBytes.length > 0) {
    const pendingWord = "0x" + Buffer.from(remainingBytes).toString("hex");
    result.push(pendingWord);
  } else {
    result.push("0x0");
  }

  result.push(remainingBytes.length.toString());
  return result;
};

export const serializeEventKey = (
  input: any,
  abiEntry: AbiEntry,
  structs: AbiStructs,
  enums: AbiEnums,
  parser: ReturnType<typeof createAbiParser>,
): string[] => {
  if (abiEntry.type === "core::byte_array::ByteArray") {
    return stringToByteArrayFelt(input).map(item => feltToHex(BigInt(item)));
  }
  const args = [input][Symbol.iterator]();
  const parsed = parseCalldataField({
    argsIterator: args,
    input: abiEntry,
    structs,
    enums,
    parser,
  });
  if (typeof parsed === "string") {
    return [feltToHex(BigInt(parsed))];
  }
  return parsed.map((item: string) => feltToHex(BigInt(item)));
};

const is2DArray = (arr: any) => {
  return Array.isArray(arr) && arr.every(item => Array.isArray(item));
};

const isUniformLength = (arr: any[][]) => {
  if (!Array.isArray(arr) || arr.length === 0) return false;

  const firstLength = arr[0].length;
  return arr.every(subArray => subArray.length === firstLength);
};

const mergeArrays = (arrays: any[][]) => {
  return arrays[0].map((_, index) => arrays.map(array => array[index][0]));
};

const certainLengthTypeMap: { [key: string]: string[][] } = {
  "core::starknet::contract_address::ContractAddress": [[]],
  "core::starknet::eth_address::EthAddress": [[]],
  "core::starknet::class_hash::ClassHash": [[]],
  "core::starknet::storage_access::StorageAddress": [[]],
  "core::bool": [[]],
  "core::integer::u8": [[]],
  "core::integer::u16": [[]],
  "core::integer::u32": [[]],
  "core::integer::u64": [[]],
  "core::integer::u128": [[]],
  "core::integer::u256": [[], []],
  "core::integer::u512": [[], [], [], []],
  "core::bytes_31::bytes31": [[]],
  "core::felt252": [[]],
};

/** Serialize a member value into merged key arrays. */
const serializeMemberKeys = (
  member: { name: string; type: string; kind: string; value: any },
  structs: AbiStructs,
  enums: AbiEnums,
  parser: ReturnType<typeof createAbiParser>,
): string[][] => {
  return mergeArrays(
    member.value.map((matchingItem: any) =>
      serializeEventKey(matchingItem, member, structs, enums, parser).map(item => [item]),
    ),
  );
};

/** Process a single key member and return its keys, or null to signal a break. */
const processKeyMember = (
  member: { name: string; type: string; kind: string; value: any },
  structs: AbiStructs,
  enums: AbiEnums,
  parser: ReturnType<typeof createAbiParser>,
): string[][] | null => {
  if (member.value === undefined) {
    if (member.type in certainLengthTypeMap) {
      return certainLengthTypeMap[member.type];
    }
    return null; // signal break
  }

  const isArrayType = member.type.startsWith("core::array::Array::");

  if (!isArrayType && Array.isArray(member.value)) {
    return serializeMemberKeys(member, structs, enums, parser);
  }

  if (isArrayType && is2DArray(member.value)) {
    if (!isUniformLength(member.value)) return null; // signal break
    return serializeMemberKeys(member, structs, enums, parser);
  }

  return serializeEventKey(member.value, member, structs, enums, parser).map(item => [item]);
};

export const composeEventFilterKeys = (
  input: { [key: string]: any },
  event: ExtractAbiEvent<ContractAbi<ContractName>, ExtractAbiEventNames<ContractAbi<ContractName>>>,
  abi: Abi,
): string[][] => {
  if (!("members" in event)) {
    return [];
  }
  const enums = CallData.getAbiEnum(abi);
  const structs = CallData.getAbiStruct(abi);
  const parser = createAbiParser(abi);
  const members = event.members as unknown as {
    name: string;
    type: string;
    kind: "key" | "data";
    value: any;
  }[];
  let keys: string[][] = [];
  const keyMembers = members.filter(member => member.kind === "key");
  const clonedKeyMembers = JSON.parse(JSON.stringify(keyMembers));
  for (const member of clonedKeyMembers) {
    if (member.name in input) {
      member.value = input[member.name];
    }
  }
  for (const member of clonedKeyMembers) {
    const memberKeys = processKeyMember(member, structs, enums, parser);
    if (memberKeys === null) break;
    keys = keys.concat(memberKeys);
  }
  return keys;
};

export function weiToEth(wei: bigint): number {
  return Number(wei) / 1e18;
}

export function friToStrk(fri: bigint): number {
  return Number(fri) / 1e18;
}

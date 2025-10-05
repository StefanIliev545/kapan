import { num } from "starknet";
import type { LendingAuthorization } from "~~/hooks/useLendingAuthorizations";

export const buildModifyDelegationRevokeCalls = (
  authorizations: ReadonlyArray<LendingAuthorization>,
): LendingAuthorization[] => {
  const revokeValue = num.toHexString(0n);
  return authorizations
    .filter(authorization => authorization.entrypoint === "modify_delegation" && authorization.calldata.length > 0)
    .map(authorization => ({
      contractAddress: authorization.contractAddress,
      entrypoint: authorization.entrypoint,
      calldata: [...authorization.calldata.slice(0, -1), revokeValue],
    }));
};

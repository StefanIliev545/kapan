/**
 * This file merges contract deployments from both Hardhat and SNFoundry.
 */
import hardhatContracts from "./hardhat/deployedContracts";
import snFoundryContracts from "./snfoundry/deployedContracts";
import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";
import merge from "lodash.merge";

// Merge both contract sets
const deployedContracts = merge({}, hardhatContracts, snFoundryContracts) as GenericContractsDeclaration;

export default deployedContracts;

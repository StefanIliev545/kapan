import { ethers } from "hardhat";

async function main() {
  const errors = [
    "OrderNotFound()",
    "OrderAlreadyExists()",
    "InvalidTrigger()",
    "NotHooksTrampoline()",
    "Unauthorized()",
    "InvalidOrderState()",
    "ZeroAddress()",
    "PreHookAlreadyExecuted()",
    "PreHookNotExecuted()",
    "TriggerNotMet()",
    "CannotCancelMidExecution()",
    "NoTokensReceived()",
    "InvalidTokens()",
  ];

  console.log("Error selectors:");
  for (const e of errors) {
    const selector = ethers.id(e).slice(0, 10);
    console.log(selector, e);
  }
  console.log("\nLooking for: 0x72ce59fc");
}

main().catch(console.error);

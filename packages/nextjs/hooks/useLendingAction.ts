import type { Network } from "./useTokenBalance";
import { useTokenBalance } from "./useTokenBalance";
import { CairoCustomEnum, CairoOption, CairoOptionVariant, CallData, Contract, num, uint256, Call } from "starknet";
import { parseUnits } from "viem";
import { useDeployedContractInfo as useStarkDeployedContractInfo } from "~~/hooks/scaffold-stark";
import { useSmartTransactor } from "~~/hooks/scaffold-stark";
import { useLendingAuthorizations, type BaseProtocolInstruction, type LendingAuthorization } from "~~/hooks/useLendingAuthorizations";
import { buildModifyDelegationRevokeCalls } from "~~/utils/authorizations";
import { useAccount as useStarkAccount } from "~~/hooks/useAccount";
import { feltToString } from "~~/utils/protocols";
import { notification } from "~~/utils/scaffold-stark";

export type Action = "Borrow" | "Deposit" | "Withdraw" | "Repay";

import { buildVesuContextOption, type VesuContext } from "~~/utils/vesu";
import { useVesuV2Vault, useVesuV2VaultBalance } from "~~/hooks/useVesuV2Vault";

export const useLendingAction = (
  network: Network,
  action: Action,
  tokenAddress: string,
  protocolName: string,
  decimals?: number,
  vesuContext?: VesuContext,
  maxAmount?: bigint,
  walletBalanceParam?: bigint,
) => {
  // Call all hooks unconditionally to satisfy React Rules of Hooks
  // Starknet hooks
  const { address: starkAddress, account: starkAccount } = useStarkAccount();
  const sendTxn = useSmartTransactor();
  const { balance: starkWalletBalanceHook = 0n } = useTokenBalance(tokenAddress, "stark");
  const { data: starkRouterGateway } = useStarkDeployedContractInfo("RouterGateway");
  const starkWalletBalance = walletBalanceParam ?? starkWalletBalanceHook;
  const { getAuthorizations, isReady: isAuthReady } = useLendingAuthorizations();

  // For VesuV2, get the vault address and pool address from context
  const isVesuV2 = protocolName === "vesu_v2";
  const poolAddress = vesuContext && 'poolAddress' in vesuContext ? vesuContext.poolAddress : "0x451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5"; // V2 default pool
  
  // Check if this is a vToken position (from context metadata or counterpart is zero address)
  const isVTokenPositionCheck = (isVesuV2 && vesuContext && 'isVtoken' in vesuContext && vesuContext.isVtoken) ||
    (isVesuV2 && vesuContext && 'positionCounterpartToken' in vesuContext && 
    (vesuContext.positionCounterpartToken === "0x0" || 
     vesuContext.positionCounterpartToken === "0x00" ||
     BigInt(vesuContext.positionCounterpartToken) === 0n));
  
  const { vtokenAddress } = useVesuV2Vault(tokenAddress, poolAddress);
  const { data: vesuGatewayV2 } = useStarkDeployedContractInfo("VesuGatewayV2");
  
  // For VesuV2 borrow against vToken, we need the collateral token's vault address and share balance
  // For vToken positions, use collateralToken metadata; otherwise use positionCounterpartToken
  const collateralTokenAddress = vesuContext && 'collateralToken' in vesuContext && vesuContext.collateralToken
    ? vesuContext.collateralToken
    : (vesuContext && 'positionCounterpartToken' in vesuContext 
        ? vesuContext.positionCounterpartToken 
        : tokenAddress);
  const { vtokenAddress: collateralVTokenAddress } = useVesuV2Vault(collateralTokenAddress, poolAddress);
  
  const { balance: vTokenBalance } = useVesuV2VaultBalance(
    collateralVTokenAddress,
    starkAddress,
    isVesuV2 && action === "Borrow" && isVTokenPositionCheck
  );

  // For direct vault withdraws on vToken positions, read user's share balance to clamp
  const { balance: directVTokenBalance } = useVesuV2VaultBalance(
    vtokenAddress,
    starkAddress,
    isVesuV2 && action === "Withdraw" && isVTokenPositionCheck
  );

  // Build Starknet calls
  const buildStarkCalls = async (amount: string, isMax = false): Promise<Call[] | null> => {
    if (!starkAddress || !starkAccount || !decimals) return null;
    
    // For VesuV2 direct vault interactions (vToken positions with zero counterpart)
    const shouldUseDirectVault = isVesuV2 && vtokenAddress && isVTokenPositionCheck && (
      action === "Deposit" || action === "Withdraw"
    );
    
    // For VesuV2 borrow against vToken: need to migrate shares to lending position
    const shouldMigrateVTokenToBorrow = isVesuV2 && vtokenAddress && isVTokenPositionCheck && action === "Borrow";
    // Handle vToken to lending position migration for borrow
    if (shouldMigrateVTokenToBorrow) {
      if (!collateralVTokenAddress || !starkRouterGateway || !vesuContext || vTokenBalance === undefined) {
        return null;
      }
      
      try {
        // Get the borrow amount (tokenAddress is the debt token we want to borrow)
        const borrowAmount = parseUnits(amount, decimals);
        const borrowAmountU256 = uint256.bnToUint256(borrowAmount);
        const debtTokenAddress = tokenAddress; // The token we're borrowing
        
        // collateralTokenAddress computed earlier from context metadata
        
        // Get user's share balance (need to redeem all shares)
        const shareBalance = vTokenBalance || 0n;
        const shareBalanceU256 = uint256.bnToUint256(shareBalance);
        
        // Compute assets from shares via ERC4626.preview_redeem so deposit uses assets
        const erc4626PreviewAbi = [
          {
            name: "preview_redeem",
            type: "function",
            inputs: [
              { name: "shares", type: "core::integer::u256" },
            ],
            outputs: [
              { name: "assets", type: "core::integer::u256" },
            ],
            state_mutability: "view",
          },
        ] as const;
        const erc4626 = new Contract({ abi: erc4626PreviewAbi as any, address: collateralVTokenAddress, providerOrAccount: starkAccount });
        const previewRes: any = await erc4626.call("preview_redeem", [shareBalanceU256]);
        let assetsAmount: bigint;
        if (previewRes && previewRes.assets && typeof previewRes.assets === "object" && "low" in previewRes.assets && "high" in previewRes.assets) {
          assetsAmount = BigInt(previewRes.assets.low) + (BigInt(previewRes.assets.high) << 128n);
        } else if (previewRes && previewRes.assets && (typeof previewRes.assets === "bigint" || typeof previewRes.assets === "number" || typeof previewRes.assets === "string")) {
          assetsAmount = BigInt(previewRes.assets);
        } else if (previewRes && Array.isArray(previewRes) && previewRes[0]) {
          const v = previewRes[0] as any;
          if (typeof v === "object" && "low" in v && "high" in v) {
            assetsAmount = BigInt(v.low) + (BigInt(v.high) << 128n);
          } else {
            assetsAmount = BigInt(v);
          }
        } else {
          assetsAmount = shareBalance; // fallback
        }
        const assetsU256 = uint256.bnToUint256(assetsAmount);
        
        // Build contexts per instruction
        const depositCtx = buildVesuContextOption({
          protocolKey: "vesu_v2",
          poolAddress,
          positionCounterpartToken: debtTokenAddress,
        });
        const borrowCtx = buildVesuContextOption({
          protocolKey: "vesu_v2",
          poolAddress,
          positionCounterpartToken: collateralTokenAddress,
        });
        
        // Build protocol instructions payload same as other flows
        const depositEnum = new CairoCustomEnum({
          Deposit: {
            basic: {
              token: collateralTokenAddress,
              amount: assetsU256,
              user: starkAddress,
            },
            context: depositCtx,
          },
          Borrow: undefined,
          Repay: undefined,
          Withdraw: undefined,
          Redeposit: undefined,
          Reborrow: undefined,
        });
        const borrowEnum = new CairoCustomEnum({
          Deposit: undefined,
          Borrow: {
            basic: {
              token: debtTokenAddress,
              amount: borrowAmountU256,
              user: starkAddress,
            },
            context: borrowCtx,
          },
          Repay: undefined,
          Withdraw: undefined,
          Redeposit: undefined,
          Reborrow: undefined,
        });
        const baseInstruction: BaseProtocolInstruction = {
          protocol_name: protocolName.toLowerCase(),
          instructions: [depositEnum, borrowEnum],
        };
        const fullInstruction = CallData.compile({ instructions: [baseInstruction] });
        const auths = await getAuthorizations([baseInstruction]);
        const authCalls: Call[] = [
          ...auths,
          {
            contractAddress: starkRouterGateway.address,
            entrypoint: "process_protocol_instructions",
            calldata: fullInstruction,
          },
        ];

        // Final sequence: redeem -> authorizations -> process
        return [
          {
            contractAddress: collateralVTokenAddress,
            entrypoint: "redeem",
            calldata: [
              shareBalanceU256.low.toString(),
              shareBalanceU256.high.toString(),
              starkAddress,
              starkAddress,
            ],
          },
          ...authCalls,
        ];
      } catch (error) {
        console.error("Error building vToken migration calls:", error);
        return null;
      }
    }
    
    if (shouldUseDirectVault) {
      console.log("Using direct ERC4626 vault interaction for", action);
      if (!vtokenAddress) {
        console.log("vtokenAddress not available");
        return null;
      }
      
      try {
        let parsedAmount = parseUnits(amount, decimals);
        if (action === "Withdraw") {
          // Shares are on vtoken decimals = 18 typically; parsedAmount is user-entered shares
          const userShares = directVTokenBalance || 0n;
          if (isMax || parsedAmount > userShares) {
            parsedAmount = userShares;
          }
        }
        
        if (action === "Deposit") {
          // ERC4626 deposit requires approval + deposit
          const amountU256 = uint256.bnToUint256(parsedAmount);
          return [
            // 1. Approve the vault to spend the tokens
            {
              contractAddress: tokenAddress,
              entrypoint: "approve",
              calldata: [
                vtokenAddress, // spender
                amountU256.low.toString(),
                amountU256.high.toString(),
              ],
            },
            // 2. Deposit into the vault
            {
              contractAddress: vtokenAddress,
              entrypoint: "deposit",
              calldata: [
                amountU256.low.toString(),
                amountU256.high.toString(),
                starkAddress, // receiver
              ],
            }
          ];
        } else if (action === "Withdraw") {
          // ERC4626 redeem: redeem(shares, receiver, owner)
          // Use redeem instead of withdraw since we're dealing with shares
          const sharesU256 = uint256.bnToUint256(parsedAmount);
          return [
            {
              contractAddress: vtokenAddress,
              entrypoint: "redeem",
              calldata: [
                sharesU256.low.toString(),
                sharesU256.high.toString(),
                starkAddress,
                starkAddress,
              ],
            }
          ];
        }
      } catch (error) {
        console.error("Error building ERC4626 vault calls:", error);
        return null;
      }
    }
    
    // Original logic for other protocols
    if (!starkRouterGateway) return null;
    try {
      let parsedAmount = parseUnits(amount, decimals);
      if (isMax) {
        if (action === "Repay") {
          const basis = maxAmount ?? parsedAmount;
          const bumped = (basis * 101n) / 100n;
          parsedAmount = bumped > starkWalletBalance ? starkWalletBalance : bumped;
        } else if (action === "Withdraw") {
          const basis = maxAmount ?? parsedAmount;
          const bumped = (basis * 101n) / 100n;
          parsedAmount = bumped;
        }
      }
      const basic = {
        token: tokenAddress,
        amount: uint256.bnToUint256(parsedAmount),
        user: starkAddress,
      };
      const context = buildVesuContextOption(vesuContext);
      console.log("token.address", tokenAddress);
      console.log("parsedAmount", parsedAmount);
      let lendingInstruction;
      switch (action) {
        case "Deposit":
          lendingInstruction = new CairoCustomEnum({
            Deposit: { basic, context },
            Borrow: undefined,
            Repay: undefined,
            Withdraw: undefined,
          });
          break;
        case "Withdraw":
          lendingInstruction = new CairoCustomEnum({
            Deposit: undefined,
            Borrow: undefined,
            Repay: undefined,
            Withdraw: { basic, withdraw_all: isMax, context },
          });
          break;
        case "Borrow":
          lendingInstruction = new CairoCustomEnum({
            Deposit: undefined,
            Borrow: { basic, context },
            Repay: undefined,
            Withdraw: undefined,
          });
          break;
        case "Repay":
          lendingInstruction = new CairoCustomEnum({
            Deposit: undefined,
            Borrow: undefined,
            Repay: { basic, repay_all: isMax, context },
            Withdraw: undefined,
          });
          break;
      }
      const baseInstruction = {
        protocol_name: protocolName.toLowerCase(),
        instructions: [lendingInstruction],
      };
      const fullInstruction = CallData.compile({ instructions: [baseInstruction] });
      const authInstruction = CallData.compile({ instructions: [baseInstruction], rawSelectors: false });
      const contract = new Contract({
        abi: starkRouterGateway.abi,
        address: starkRouterGateway.address,
        providerOrAccount: starkAccount,
      });
      const protocolInstructions = await contract.call(
        "get_authorizations_for_instructions",
        authInstruction,
      );
      const authorizations: LendingAuthorization[] = [];
      if (Array.isArray(protocolInstructions)) {
        for (const inst of protocolInstructions as any[]) {
          const addr = num.toHexString(inst[0]);
          const entry = feltToString(inst[1]);
          authorizations.push({
            contractAddress: addr,
            entrypoint: entry,
            calldata: (inst[2] as bigint[]).map(f => num.toHexString(f)),
          });
        }
      }
      const revokeAuthorizations = buildModifyDelegationRevokeCalls(authorizations);
      authorizations.push({
        contractAddress: starkRouterGateway.address,
        entrypoint: "process_protocol_instructions",
        calldata: fullInstruction,
      });
      return [...authorizations, ...revokeAuthorizations];
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  const executeStark = async (amount: string, isMax = false) => {
    if (!starkAccount) return;
    try {
      const calls = await buildStarkCalls(amount, isMax);
      if (!calls) return;
      await sendTxn(calls);
      notification.success("Instruction sent");
    } catch (e) {
      console.error(e);
      notification.error("Failed to send instruction");
    }
  };

  // Always return Starknet functions (network parameter kept for API compatibility)
  return { execute: executeStark, buildTx: undefined, buildCalls: buildStarkCalls };
};

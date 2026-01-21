# Euler V2 Integration Implementation Plan

## Overview

Integrate Euler V2 as a supported lending protocol in Kapan Finance. Euler V2 uses a vault-based architecture (ERC-4626 with borrowing) mediated by the Ethereum Vault Connector (EVC).

**Target**: Arbitrum first
**Scope**: Write gateway only (positions via subgraph, no View gateway)

---

## Implementation Components

### 1. Smart Contract: EulerGatewayWrite

**File**: `packages/hardhat/contracts/v2/gateways/euler/EulerGatewayWrite.sol`

**Operations Supported**:
- `DepositCollateral` - Deposit to vault + enable as collateral
- `WithdrawCollateral` - Withdraw from vault
- `Borrow` - Borrow from vault (requires EVC setup)
- `Repay` - Repay debt
- `GetBorrowBalance` - Query debt
- `GetSupplyBalance` - Query collateral

**Context Encoding**:
```solidity
struct EulerVaultParams {
    address borrowVault;      // Vault to borrow from (controller)
    address collateralVault;  // Vault for collateral
}
// bytes context = abi.encode(borrowVault, collateralVault)
```

**EVC Authorization Flow** (in `authorize()`):
1. `setAccountOperator(user, gateway, true)` - Allow gateway to act on behalf
2. `enableCollateral(user, collateralVault)` - Designate collateral source
3. `enableController(user, borrowVault)` - Allow borrow vault to enforce rules

### 2. Interface Files

**Files**:
- `packages/hardhat/contracts/v2/interfaces/euler/IEulerVault.sol`
- `packages/hardhat/contracts/v2/interfaces/euler/IEVC.sol`

### 3. Deployment Script

**File**: `packages/hardhat/deploy/v2/11_deploy_euler_gateway.ts`

**Chain Config**:
- Arbitrum (42161): EVC at `0x0C9a3dd6b8F28529d72d7f9cE918D493519EE383`

### 4. Frontend: API Routes

**Files**:
- `packages/nextjs/app/api/euler/[chainId]/vaults/route.ts` - Fetch available vaults
- `packages/nextjs/app/api/euler/[chainId]/positions/route.ts` - Fetch user positions

**Subgraph Endpoint** (Arbitrum):
```
https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-v2-arbitrum/latest/gn
```

### 5. Frontend: Position Hook

**File**: `packages/nextjs/hooks/useEulerLendingPositions.ts`

Following `useMorphoLendingPositions.ts` pattern:
- React Query for data fetching
- Position transformation to `ProtocolPosition` format
- `EulerVaultContext` for instruction building

### 6. Frontend: Instruction Helpers

**File**: `packages/nextjs/utils/v2/instructionHelpers.ts` (additions)

Add:
- `encodeEulerContext(context)` - Encode vault params
- `createEulerInstruction(op, token, user, amount, context)` - Build instructions

---

## File Summary

| Component | Path | Action |
|-----------|------|--------|
| Gateway Contract | `contracts/v2/gateways/euler/EulerGatewayWrite.sol` | Create |
| IEulerVault | `contracts/v2/interfaces/euler/IEulerVault.sol` | Create |
| IEVC | `contracts/v2/interfaces/euler/IEVC.sol` | Create |
| Deploy Script | `deploy/v2/11_deploy_euler_gateway.ts` | Create |
| Vaults API | `app/api/euler/[chainId]/vaults/route.ts` | Create |
| Positions API | `app/api/euler/[chainId]/positions/route.ts` | Create |
| Position Hook | `hooks/useEulerLendingPositions.ts` | Create |
| Instruction Helpers | `utils/v2/instructionHelpers.ts` | Modify |
| Protocol Name Map | `utils/v2/instructionHelpers.ts` | Modify (add "euler") |

---

## Risk Mitigations

1. **Controller Limitation**: Euler allows ONE controller per account - check `getControllers()` before enabling
2. **Share vs Asset Accounting**: Use `convertToAssets()` for accurate values
3. **Deauthorization**: Keep EVC permissions enabled (safe to keep, risky to disable mid-flow)

---

## Testing Strategy

**Fork Test**: `packages/hardhat/test/v2/euler/EulerGateway.fork.ts`
- Test against live Euler V2 on Arbitrum fork
- Full flow: Deposit -> Enable -> Borrow -> Repay -> Withdraw
- Authorization generation tests

---

## Approval Checklist

- [ ] Smart contract architecture approved
- [ ] EVC authorization pattern approved
- [ ] Frontend API/hook structure approved
- [ ] Ready to proceed with implementation

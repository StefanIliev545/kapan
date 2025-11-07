# Security Audit: KapanRouter V2

## Current Security Posture

### ✅ **Good Security Practices Already Implemented**

1. **Safe Token Transfers**: All contracts use `SafeERC20` for token operations
2. **Reentrancy Protection**: Router and gateways use `ReentrancyGuard` and `nonReentrant` modifiers
3. **Flash Loan Callback Validation**: Flash loan callbacks validate `msg.sender == address(balancerV2Vault)` or `msg.sender == address(balancerV3Vault)`
4. **Gateway Access Control**: Gateways use `onlyRouter` and `onlyRouterOrSelf(user)` modifiers
5. **Router PullToken Authorization**: `processPullToken` checks `routerInstruction.user == msg.sender`

### ⚠️ **Security Gaps Identified**

#### 1. **Missing User Authorization in Router**

**Issue**: `processProtocolInstructions` doesn't validate that `msg.sender` matches the `user` specified in protocol instructions (Borrow, Repay, Withdraw, Deposit, etc.). Only `PullToken` has this check.

**Risk**: An attacker could potentially call `processProtocolInstructions` with instructions specifying a different user, if they have knowledge of the user's allowances/approvals.

**Current Behavior**:
- Router accepts any caller for `processProtocolInstructions`
- Router processes instructions with any `user` address specified in the instruction
- Gateways check `onlyRouterOrSelf(user)`, but since router is calling, they pass

**Fix Required**: Add validation that `msg.sender == user` for each protocol instruction that affects user funds.

#### 2. **Direct Gateway Access Allowed**

**Issue**: Gateways allow users to call functions directly via `onlyRouterOrSelf(user)` modifier. While this provides flexibility, it bypasses the router's instruction flow and atomicity guarantees.

**Risk**: Lower risk - users can only act on their own behalf, but it breaks the atomic transaction model.

**Mitigation**: Consider documenting this behavior and ensuring users understand the implications. Alternatively, consider removing direct access if atomicity is critical.

#### 3. **No Validation of User Parameter in Instructions**

**Issue**: The router trusts the `user` parameter in `LendingInstruction` without verifying it matches the caller or validating authorization.

**Risk**: If combined with other vulnerabilities, this could allow unauthorized actions.

**Fix Required**: Add comprehensive user validation in `processProtocolInstructions`.

#### 4. **Missing Events for Critical Operations**

**Issue**: No events emitted for token transfers, approvals, or user operations.

**Risk**: Difficulty in monitoring and detecting suspicious behavior.

**Fix Required**: Add events for all critical operations.

## Recommended Security Enhancements

### Priority 1: User Authorization Validation

Add validation in `processProtocolInstructions` to ensure `msg.sender` matches the `user` in each instruction:

```solidity
function processProtocolInstructions(ProtocolTypes.ProtocolInstruction[] calldata instructions) external {
    // Validate caller is authorized for all operations
    for (uint256 i = 0; i < instructions.length; i++) {
        ProtocolTypes.ProtocolInstruction calldata pi = instructions[i];
        
        if (keccak256(abi.encode(pi.protocolName)) == keccak256(abi.encode("router"))) {
            RouterInstruction memory r = abi.decode(pi.data, (RouterInstruction));
            require(r.user == msg.sender, "Unauthorized: user mismatch");
        } else {
            ProtocolTypes.LendingInstruction memory li = abi.decode(pi.data, (ProtocolTypes.LendingInstruction));
            require(li.user == msg.sender, "Unauthorized: user mismatch");
        }
    }
    
    convertToStack(instructions);
    runStack();
}
```

### Priority 2: Add Events for Critical Operations

Add events to track all user operations:

```solidity
event TokensPulled(address indexed user, address indexed token, uint256 amount);
event TokensPushed(address indexed user, address indexed token, uint256 amount);
event ProtocolInstructionExecuted(address indexed user, string indexed protocol, uint8 operation);
event FlashLoanExecuted(address indexed token, uint256 amount);
```

### Priority 3: Consider Permit2 Integration

For future enhancement, consider integrating Permit2 to eliminate persistent approvals and enable single-transaction flows.

### Priority 4: Additional Input Validation

Add bounds checking and validation for:
- Token addresses (not zero address)
- Amounts (not zero unless explicitly allowed)
- Protocol names (registered gateways only)

## Testing Recommendations

1. **Authorization Tests**: Test that operations fail when `msg.sender != user` in instructions
2. **Reentrancy Tests**: Verify reentrancy guards prevent double-spending
3. **Flash Loan Tests**: Verify callbacks can only be called by authorized providers
4. **Edge Cases**: Test with zero amounts, invalid addresses, unregistered protocols
5. **Integration Tests**: Test full migration flows end-to-end

## Deployment Checklist

- [ ] Add user authorization validation to `processProtocolInstructions`
- [ ] Add events for all critical operations
- [ ] Comprehensive test suite for authorization scenarios
- [ ] External security audit focused on access control
- [ ] Consider timelock for admin functions if upgradable
- [ ] Document security model for users and developers


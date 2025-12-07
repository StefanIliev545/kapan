# Flash-Loan "Multiply" Flow with KapanRouter V2

This guide outlines how to build an Euler-style leveraged loop ("multiply") using KapanRouter V2. The pattern uses a flash loan to bootstrap liquidity, swaps the borrowed asset into more collateral, deposits it, and finally borrows the debt asset to repay the flash loan — all in a single transaction.

## Prerequisites

- The desired lending and swap gateways (e.g. `aave`, `compound`, `oneinch`) are registered on the router.
- The user has approved the router to pull the initial collateral token.
- For protocols that require credit delegation (e.g. Aave), the user has approved borrowing on their behalf.
- Front-ends compute the flash-loan amount based on the target multiplier, fees, and protocol LTV limits.

## Instruction stack (high level)

The multiply transaction is a linear set of router and protocol instructions. The sequence below assumes the user wants to lever collateral token **C** by borrowing debt token **D** (e.g. borrow USDC to buy more WETH):

1. **Pull and deposit initial collateral**
   - `PullToken` from the user for the starting amount of **C**.
   - `Approve` **C** to the lending gateway.
   - Lending `DepositCollateral` into the protocol on behalf of the user.

2. **Request the flash loan**
   - `ToOutput` to define the flash-loan amount of **D**.
   - `FlashLoan` from the chosen provider using the output above.
   - The router callback appends an output for the total repayment (principal + fee) and resumes execution with the borrowed **D** in balance.

3. **Swap debt asset into more collateral**
   - `Approve` **D** to the DEX gateway.
   - Swap instruction (e.g. via `oneinch`) converting **D → C** with `minAmountOut` to enforce slippage.
   - The gateway returns outputs for received **C** (and any **D** refund).

4. **Deposit acquired collateral**
   - `Approve` the new **C** output to the lending gateway.
   - Lending `DepositCollateral` to add the purchased **C** to the user’s position.

5. **Borrow to cover the flash-loan repayment**
   - Lending `Borrow` of **D** using the flash-loan repayment output as the input pointer, so the borrowed amount matches the owed principal + fee.
   - The gateway sends **D** back to the router; the flash-loan provider pulls or receives repayment automatically at the end of the callback.

6. **Return leftovers (optional)**
   - If the swap refunded any **D**, include `PushToken` targeting the refund output to send the surplus back to the user.

## Key considerations

- **Atomicity:** Any failure (insufficient collateral factor, swap slippage, missing approvals) reverts the entire sequence and the flash loan is not repaid, leaving the user unchanged.
- **Limits:** Respect protocol LTVs when sizing the flash loan; practical leverage caps often sit below the theoretical maximum collateral factor.
- **Approvals:** Authorize ERC-20 transfers to the router and credit delegation to the lending gateway ahead of time; router-to-gateway allowances are handled via `Approve` steps in the stack.
- **Slippage:** Set `minAmountOut` appropriately on the swap instruction. The transaction fails if the trade cannot deliver at least that amount of collateral.
- **Clean balances:** Use `PushToken` to forward any refunds so the router does not retain stray funds.

Following this recipe enables a one-transaction leveraged long experience similar to Euler’s multiply while relying entirely on KapanRouter V2’s existing flash-loan, swap, and lending gateways.

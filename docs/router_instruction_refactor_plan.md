# Router Instruction Set Refactor Plan

To safely adopt the pointer-based router design, we will deliver the work across the following stages:

1. **TokenAmount primitives and pointer resolution utilities (current step).**
   * Introduce a reusable `TokenAmount` type that can represent either static literals or pointers to previous instruction outputs.
   * Provide helper functions for constructing static/pointer instances, resolving pointers against recorded outputs, and converting resolved values back into `InstructionOutput` records.
   * Add unit tests that exercise successful pointer resolution and the different failure modes the router will surface when a pointer is invalid.

2. **Instruction schema migration.**
   * Update `IGateway` instruction definitions so every argument that carries a token/amount pair uses the new `TokenAmount` input type.
   * Remove the legacy compound instructions (`Reswap`, `Redeposit`, `Reborrow`, etc.) that become redundant once pointers are available.
   * Adjust serialization and any call sites so the new instruction layouts can be emitted from off-chain tooling.

3. **Router execution engine updates.**
   * Refactor `RouterGateway` to resolve inputs through the new utilities, persist produced outputs, and expose them to subsequent instructions.
   * Adapt existing protocol gateway implementations (Vesu, Nostra, Avnu, Ekubo) to emit `TokenAmount` outputs instead of bespoke structs.
   * Ensure that transfers are always triggered via an explicit `TRANSFER` instruction rather than implicit branches.

4. **Flash loan and borrow-balance instructions.**
   * Introduce `FLASH_LOAN` and `BORROW_BALANCE` instruction variants, using nested execution to support recursive flash loan flows.
   * Wire the flash-loan callback so nested instruction arrays are executed atomically and repayments are enforced before returning control to the lending protocol.
   * Extend test coverage to validate flash-loan success paths, nested reentrancy, and expected failure reverts.

5. **Documentation and tooling updates.**
   * Refresh developer docs and examples to show how to assemble pointer-driven instruction sequences.
   * Update deployment scripts, front-end encoders, and any TypeScript definitions so they emit the new schema and instruction names.

Delivering the refactor through these incremental steps lets us keep the existing production integrations healthy while progressively rolling out the new programmable router experience.

# Generated contract declarations

`hardhat/deployedContracts.ts` and `snfoundry/deployedContracts.ts` are runtime
deployment registries generated from contract artifacts. They contain hundreds
of kilobytes of deeply nested ABI literals.

They deliberately start with `// @ts-nocheck`.

This does **not** change runtime exports or skip application type checking. It
prevents TypeScript from recursively inferring and checking the generated ABI
literal types every time the frontend project is compiled. Consumers should use
the public contract utility types (`GenericContract`,
`GenericContractsDeclaration`, and contract accessors) rather than depending on
the inferred literal type of a generated registry.

If the generators overwrite these files, preserve the directive as the first
line, or update the generator template to emit it. ABI correctness belongs to
the Solidity/Cairo compile and contract-test pipelines; application TypeScript
should validate the typed boundary around those generated runtime values.

# RHBurnerPass residual hardening

This update adds an on-chain official integration boundary without replacing the existing testnet protocol state.

## Added

- `RHBurnerPassOfficialIntegrationRegistry.sol`
  - immutable canonical FeeVault
  - one-time canonical Registry binding
  - multisig-ready two-step ownership transfers
  - exact runtime code-hash pinning for every approved target
  - automatic invalidation when code hash or protocol bindings no longer match
- `RHBurnerPassRegistryV2.sol`
  - future production Registry that refuses new authorizations to non-official targets
  - revocation remains available for every existing authorization
- `deploy:official-registry`
  - attaches the new official registry to the already-deployed testnet Registry/FeeVault and updates `public/config.json`
- `approve:integration`
  - calculates the target runtime code hash and approves it from the protocol owner; if the owner is a multisig, prints the exact calldata instead

## Economic invariants

- delegated mint fee: exactly `0.00005 ETH` per NFT in FeeVault V2
- authorization fee: none beyond network gas
- treasury: immutable once FeeVault is deployed
- official integration owner cannot change FeeVault fee or treasury

## Important limitation

Open-source forks cannot be prevented. The canonical protocol can, however, make them non-official and refuse to authorize them through the trusted portal / Registry V2. Upgradeable proxy targets require explicit review because proxy runtime bytecode alone does not prove the implementation cannot change.

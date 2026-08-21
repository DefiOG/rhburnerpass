# RHBurnerPass v2 Architecture

Public product release: **RHBurnerPass v2**. Internal contract suffixes continue from the already-deployed v1 implementation generations (`RegistryV2`, `FeeVaultV2`).

## v1 preservation
v2 is additive. It does not modify or upgrade deployed v1 contracts. Existing RegistryV2, FeeVaultV2, OfficialIntegrationRegistry, MintGate, and ReferenceMint source files are protected by hash-guard tests.

## v2 contracts
- `RHBurnerPassFactoryV2`: permissionless canonical mint deployment and partner ownership/payout registry.
- `RHBurnerPassRegistryV3`: exact-target vault-to-burner authorization for Factory mints.
- `RHBurnerPassFeeVaultV3`: fixed 0.00005 ETH delegated fee; 90% protocol / 10% partner.
- `RHBurnerPassMintTemplateV2`: canonical ERC-721 Merkle allowlist mint using unchanged MintGate behavior.

## Trust model
Factory creation is permissionless; no manual RHBP approval transaction is required. Official status comes from canonical Factory provenance, not a webpage claim. The integration owner chooses an on-chain payout at creation and may change it for future fees. Mint callers/frontends cannot supply a payout during minting.

The protocol owner has an emergency `setIntegrationBlocked` switch. It cannot redirect partner balances, seize integration ownership, or change the fixed split.

## Fee safety
FeeVaultV3 accepts fees only from canonical unblocked Factory mints. Partner revenue is accrued by payout address at collection time. Treasury withdrawals use only `protocolAccrued`. Anyone may trigger a partner claim, but funds can only go to the credited partner.

## Vault accounting
The unchanged MintGate stores claims in `claimedByVault[vault]`, so burner rotation never creates a fresh allocation. Direct vault and delegated burner mints consume the same bucket. NFTs go to `msg.sender`.

## Verification policy before mainnet

RHBurnerPass v2 uses three layers of verification:

1. **Production source hash guards** keep the deployed v1 core source files byte-identical.
2. **Behavioral model tests** exercise the allocation and 90/10 accounting state transitions without adding a second local-EVM dependency stack.
3. **Robinhood Chain Testnet E2E verification** deploys/uses the actual Solidity contracts and exercises Factory provenance, target-scoped authorization, burner rotation, vault-keyed claims, exact fee accrual, payout rotation, allocation exhaustion, partner claims, emergency blocking/revocation, direct-vault fee exemption, and (when the deployer is testnet treasury) treasury isolation.

Run the network verifier only after the local compile/test suite is green:

```bash
npm run verify:v2:testnet
```

The verifier generates temporary vault/burner/payout accounts in memory. It writes no temporary private keys to disk. The configured deployer only funds the temporary vault/burners with small amounts of Robinhood Chain Testnet ETH.

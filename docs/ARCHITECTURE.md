# RHBurnerPass architecture

## Objective

Keep a valuable vault wallet away from unfamiliar mint frontends while preserving the vault's allowlist or holder eligibility.

## Authorization flow

1. A collection deploys a RHBurnerPass-aware mint contract.
2. The protocol reviews the deployed integration and approves its exact runtime bytecode hash in `RHBurnerPassOfficialIntegrationRegistry`.
3. The vault owner opens the trusted RHBurnerPass portal.
4. The portal verifies that the target is still an official integration and still points to the canonical Registry and FeeVault.
5. The vault authorizes one burner for that exact target.
6. The vault disconnects.
7. The burner visits the collection's separate mint site.
8. The mint verifies vault eligibility and the vault-to-burner authorization.
9. Claim usage is recorded against the vault, while the NFT is delivered to the burner.
10. A successful delegated mint sends exactly `0.00005 ETH × quantity` to the canonical FeeVault.
11. The vault can later return to RHBurnerPass and revoke the scoped authorization.

## Production protocol boundary

The production-design stack is:

- `RHBurnerPassFeeVaultV2` — fee fixed in bytecode at exactly `0.00005 ETH` per delegated NFT; immutable treasury.
- `RHBurnerPassOfficialIntegrationRegistry` — protocol-controlled on-chain list of reviewed integrations, pinned to exact runtime bytecode hashes and canonical protocol bindings.
- `RHBurnerPassRegistryV2` — refuses to create new burner delegations for targets that are not currently official. Revocation is always allowed.
- `RHBurnerPassMintGate` — reference helper for vault-keyed allocation accounting and atomic fee collection.

The official integration registry is intentionally controlled by a protocol owner that should be a multisig on mainnet. It cannot change the fixed FeeVault fee or treasury. Its job is only to approve or revoke which mint contracts may be represented as official RHBurnerPass integrations.

### Bootstrap and ownership

The Official Integration Registry is deployed with:

- an immutable canonical FeeVault;
- a protocol owner;
- a one-time deployer/bootstrapper privilege that can only bind the canonical Registry if it has not been bound yet.

Once the canonical Registry is bound, it cannot be changed. Ownership transfers use a two-step `beginOwnershipTransfer` / `acceptOwnership` flow.

## Current testnet compatibility

The already-deployed testnet Registry and FeeVault remain valid and are not modified. To harden that deployment without replacing it, deploy `RHBurnerPassOfficialIntegrationRegistry`, bind it to the existing Registry and FeeVault, approve the existing demo mint, and add the new registry address to `public/config.json`.

On that legacy testnet Registry, official-target enforcement happens in the trusted vault portal. Future `RHBurnerPassRegistryV2` deployments enforce the same rule on-chain.

## Application boundary

The default RHBurnerPass application is a vault-only authorization and revocation portal. It must not ask the vault to perform the burner-side mint flow, and it must not present the reference demo as the normal product journey.

The repository's `#/demo` route is a developer test harness for `RHBurnerPassDemoMint`. A real integration puts equivalent burner-side logic in the collection's own frontend, where the vault should never connect.

The frontend wallet session has one source of truth for connector, account, and chain. Contract writes receive that session's wallet client explicitly and verify immediately before submission that its account matches the address shown during review and that the active chain is Robinhood Chain Testnet. Read-only calls use the public RPC client.

## Why target-scoped authorization

RHBurnerPass intentionally does not provide blanket wallet authority. Each authorization names one burner and one mint contract. A malicious unrelated contract therefore cannot become authorized just because a burner was approved elsewhere.

## Why claims are keyed to the vault

If a one-NFT allowlist wallet authorizes five burners and a mint counts claims by `msg.sender`, the same allocation can be multiplied. `RHBurnerPassMintGate` stores `claimedByVault[vault]` specifically to prevent that class of integration error.

## Fee flow

`burner -> official compatible mint -> canonical RHBurnerPassFeeVaultV2 -> immutable treasury`

The mint calculates the fixed `0.00005 ETH × quantity` protocol fee, includes that in the user's required payment, then calls the canonical fee vault inside the same transaction. Atomic EVM execution means a later revert in the mint also reverts the fee collection.

## What the official registry does and does not guarantee

Approval pins the target's current runtime code hash and verifies its exposed Registry and FeeVault bindings. Any code-hash change automatically makes a non-proxy target fail `isOfficialIntegration` until re-reviewed and re-approved.

Upgradeable proxy contracts require special review because a proxy's runtime bytecode can remain unchanged while its implementation changes. The mainnet policy should reject upgradeable targets unless their upgrade controls are explicitly reviewed and accepted. An approval registry cannot mathematically prevent someone from forking open-source code; it defines which deployments the canonical RHBurnerPass protocol recognizes as official.

## Trust boundary

RHBurnerPass proves an authorization relationship and enforces protocol conformance for official integrations. It does **not** make a third-party mint contract safe. The burner remains the security boundary for the collection's mint interaction.

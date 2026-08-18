# RHBurnerPass fee model

## Core model

RHBurnerPass charges no protocol fee to create, verify, or revoke a burner authorization. A successful mint made through an authorized burner pays a protocol fee per NFT.

The production fee is fixed at exactly `0.00005 ETH/NFT`:

- 1 NFT -> `0.00005 ETH`
- 10 NFTs -> `0.0005 ETH`
- 1,000 NFTs -> `0.05 ETH`
- 10,000 NFTs -> `0.5 ETH`
- 100,000 NFTs -> `5 ETH`

These are protocol-unit examples, not fiat revenue forecasts; ETH value can vary materially.

## Fee immutability

`RHBurnerPassFeeVaultV2` hard-codes:

```solidity
uint256 public constant FEE_PER_NFT = 0.00005 ether;
```

There is no fee setter, no deployment-time fee argument, and no owner function that can increase or decrease it.

The treasury is supplied once at deployment and stored as `immutable`. The deployment `.env` is only an input to contract creation; changing or deleting the local environment file later cannot redirect protocol revenue.

For mainnet, the treasury should be a dedicated multisig or other hardened protocol treasury rather than a normal browser wallet.

## Residual protection

The important residual risk in an open-source protocol is not the local `.env`; it is a third party substituting another FeeVault or deploying modified mint logic.

RHBurnerPass addresses that with an official-integration layer:

1. Every official integration must expose the canonical Registry and FeeVault addresses.
2. `RHBurnerPassOfficialIntegrationRegistry` records the exact runtime bytecode hash reviewed by the protocol owner/multisig.
3. `isOfficialIntegration(target)` becomes false if the target code hash changes or its canonical bindings stop matching.
4. The trusted vault portal refuses new authorizations to targets that are not official.
5. `RHBurnerPassRegistryV2` enforces the same official-target requirement on-chain for future deployments.
6. Revocation never requires official status, so a vault can always remove an authorization.

This makes a zero-fee fork a different protocol deployment rather than something that can silently present itself as an official RHBurnerPass target through the canonical portal/Registry V2.

## Governance boundary

The Official Integration Registry needs an owner so new collection contracts can be reviewed and approved over time. That owner should be a multisig. The owner can approve or revoke integrations, but it cannot change the FeeVault's fixed `0.00005 ETH` fee or its immutable treasury.

Upgradeable proxies require extra caution because proxy runtime code can remain unchanged while implementation logic changes. Mainnet policy should default to non-upgradeable mint targets or require explicit review of proxy upgrade controls.

## Existing testnet deployment

The current Robinhood Chain Testnet FeeVault remains the already-deployed v0.1 contract configured at `0.00005 ETH/NFT`. It is not redeployed by this hardening update.

The Official Integration Registry can be added beside the existing testnet contracts and bound to their current addresses. This provides an on-chain official-target list for the portal while preserving all existing testnet state.

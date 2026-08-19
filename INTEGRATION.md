# Integrating RHBurnerPass

This guide is for NFT collection developers who want holders to preserve vault-wallet eligibility while minting from a separate burner wallet.

RHBurnerPass is live on **Robinhood Chain mainnet**.

> RHBurnerPass is not independently professionally audited. Review the contracts and integration model before production use.

## Canonical mainnet addresses

```text
RegistryV2
0xA6D25fD2214C6c136599F65bDc07DE77A5f67d6e

FeeVaultV2
0xd3e873CCE414a0a24F9E888236faCe40ab6C02DA

OfficialIntegrationRegistry
0xb8d1f6F919B5A19B1EA1036f2358f21184f4C282
```

Delegated protocol fee:

```text
0.00005 ETH per NFT
```

## The integration invariant

For a delegated protected mint:

```text
eligibility identity = vault
allocation accounting = vault
transaction sender = burner
NFT recipient = burner
RHBurnerPass fee payer = burner transaction
authorization scope = vault + burner + exact target contract
```

Do not key allowlist usage to `msg.sender` if `msg.sender` is the burner.

## Recommended path: inherit RHBurnerPassMintGate

The repository includes:

```text
contracts/RHBurnerPassMintGate.sol
```

Its constructor receives the canonical RegistryV2 and FeeVaultV2.

A compatible collection can inherit it:

```solidity
contract MyCollection is ERC721, RHBurnerPassMintGate {
    constructor()
        ERC721("My Collection", "MYNFT")
        RHBurnerPassMintGate(
            0xA6D25fD2214C6c136599F65bDc07DE77A5f67d6e,
            0xd3e873CCE414a0a24F9E888236faCe40ab6C02DA
        )
    {}
}
```

The public immutable variables inherited from the gate expose:

```solidity
rhBurnerPassRegistry()
rhBurnerPassFeeVault()
```

The Official Integration Registry checks these bindings before a target can be approved.

## Mint flow

A protected mint should receive enough information to prove the **vault's** eligibility.

Example shape:

```solidity
function mint(
    address vault,
    uint256 maxAllocation,
    uint256 quantity,
    bytes32[] calldata proof
) external payable {
    // 1. Verify the allowlist/holder proof against `vault`, not msg.sender.
    // 2. Compute project mint payment.
    // 3. Compute RHBurnerPass fee.
    // 4. Require exact total payment.
    // 5. Consume allocation against `vault`.
    // 6. Collect delegated protocol fee.
    // 7. Mint NFTs to msg.sender (the burner or vault).
}
```

The production reference implementation is:

```text
contracts/RHBurnerPassReferenceMint.sol
```

## Authorization check

`RHBurnerPassMintGate` resolves direct and delegated callers.

Conceptually:

```solidity
if (caller == vault) {
    // direct vault mint
} else {
    require(
        registry.isAuthorized(vault, caller, address(this)),
        "unauthorized burner"
    );
}
```

The authorization is scoped to the exact target contract address.

Authorization for Collection A does not authorize the same burner for Collection B.

## Allocation accounting

This is one of the most important integration rules.

Wrong:

```solidity
claimed[msg.sender] += quantity;
```

For a delegated mint, that would key usage to the burner and could let multiple burners multiply one vault's allocation.

Correct:

```solidity
claimedByVault[vault] += quantity;
```

The gate's `_consumeVaultAllocation(...)` helper already follows this model.

## Fee handling

For a direct vault self-mint:

```text
RHBurnerPass protocol fee = 0
```

For a delegated mint:

```text
RHBurnerPass protocol fee =
FeeVaultV2.quote(quantity)
```

At the current immutable mainnet fee:

```text
quantity 1 = 0.00005 ETH
quantity 2 = 0.00010 ETH
```

Use the FeeVault as the source of truth rather than duplicating fee arithmetic in application code.

The reference gate calls:

```solidity
rhBurnerPassFeeVault.collect{value: fee}(
    vault,
    msg.sender,
    quantity
);
```

The fee collection occurs inside the same outer mint transaction, so if the mint reverts, the fee collection reverts too.

## Project mint price

RHBurnerPass does not replace the collection's own mint payment.

For a delegated mint:

```text
msg.value = project mint payment + RHBurnerPass delegated fee
```

Your project proceeds and the RHBurnerPass fee should remain logically separate.

## Eligibility systems

RHBurnerPass can be paired with eligibility systems that can resolve identity to an explicit `vault` address, for example:

- Merkle allowlists;
- NFT-holder checks;
- token-holder checks;
- signed eligibility authorizations;
- custom collection-specific eligibility.

The key requirement is that the collection verifies the eligibility of the vault rather than blindly using `msg.sender`.

## Deployment checklist

Before asking for official approval:

1. Compile and test the collection.
2. Deploy on Robinhood Chain mainnet.
3. Source-verify the deployed contract.
4. Confirm the target exposes `rhBurnerPassRegistry()`.
5. Confirm it returns the canonical RegistryV2.
6. Confirm the target exposes `rhBurnerPassFeeVault()`.
7. Confirm it returns the canonical FeeVaultV2.
8. Record the exact deployed runtime code hash.
9. Test direct mint behavior.
10. Test delegated mint behavior on a controlled deployment.
11. Confirm claims are keyed to vault.
12. Confirm NFTs are sent to the intended caller/burner.
13. Confirm delegated fees are routed through FeeVaultV2.
14. Submit the deployment for RHBurnerPass integration review.

## Official integration approval

New vault → burner authorizations are accepted by RegistryV2 only for targets recognized by the canonical Official Integration Registry.

Approval is controlled by the RHBurnerPass protocol Safe.

The review process checks at minimum:

```text
target has deployed code
runtime code hash matches the reviewed hash
target Registry getter points to canonical RegistryV2
target FeeVault getter points to canonical FeeVaultV2
```

After Safe approval:

```solidity
OfficialIntegrationRegistry.isOfficialIntegration(target)
```

must return:

```text
true
```

before users should create new authorizations for the target.

## Collection frontend

The collection mint frontend should be a **burner-side** experience.

Recommended user flow:

1. User obtains allowlist/holder eligibility in their vault.
2. User opens the trusted RHBurnerPass vault portal.
3. Vault authorizes a burner for your exact mint contract.
4. Vault disconnects.
5. User opens your collection mint frontend with the burner.
6. Your frontend asks for the vault address and any eligibility proof data needed by your mint.
7. Burner submits the mint.
8. NFT lands in the burner.
9. Allocation usage is recorded against the vault.

Do not instruct users to reconnect their valuable vault to your collection frontend if the entire purpose of the integration is to keep that vault away from the mint site.

## Revocation

The vault can revoke its scoped authorization through RegistryV2.

Revocation remains available even if the target later loses official status.

Already-minted NFTs are unaffected by revocation.

Previously consumed vault allocation remains consumed.

## Upgradeable proxies

Upgradeable targets require special handling.

The Official Integration Registry pins a deployed target runtime code hash. For a normal immutable contract this strongly ties approval to the reviewed code.

For a proxy, the proxy runtime code hash can stay unchanged while the implementation changes.

Do not treat a proxy approval as equivalent to an immutable integration without an additional upgrade/implementation review model.

## Reference production integration

Mainnet reference mint:

```text
0x94FEa8Ea67f8B2B72c9c196aCAFd2C0471F30309
```

Its source is:

```text
contracts/RHBurnerPassReferenceMint.sol
```

Its deployment record is:

```text
deployments/reference-mainnet.json
```

Its reproducible verification package is:

```text
verification/reference-mint-standard-input.json
```

The reference integration has completed a real mainnet protected mint and revocation lifecycle.

## Security note

“Official RHBurnerPass integration” means the specific target contract passed the protocol's binding/code-hash approval process.

It does not mean RHBurnerPass endorses the collection team, website, metadata, other contracts, or business.

See `SECURITY.md`.

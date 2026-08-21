# RHBurnerPass

> **Don’t get burned. Use RHBurnerPass.**

RHBurnerPass is a target-scoped safe-mint protocol for **Robinhood Chain**. It lets a valuable vault wallet keep allowlist or NFT-holder eligibility while a low-value burner wallet performs the actual mint on a compatible collection contract.

**Independent community project. Not affiliated with or endorsed by Robinhood Markets, Inc.**

> **Status: Robinhood Chain mainnet live. Core contracts and the production reference integration are source-verified and have passed an end-to-end mainnet protected-mint/revocation test. RHBurnerPass has not received an independent professional audit.**

## Live portal

Vault authorization portal:

`https://defiog.github.io/rhburnerpass/`

The portal is for the **vault** to create, verify, or revoke a target-scoped burner authorization. The vault should disconnect after that task is complete.

The burner then uses the participating collection's own mint frontend.

## Why RHBurnerPass exists

Collectors often earn whitelist or holder access from the same wallet that stores valuable NFTs and assets. A normal mint flow asks that valuable wallet to connect to a collection frontend.

RHBurnerPass separates:

- **vault** — owns eligibility;
- **burner** — sends the mint transaction and receives the NFT;
- **target mint** — the one exact compatible contract the authorization applies to.

A compatible mint resolves eligibility to the vault, verifies the caller is an authorized burner, counts allocation usage against the vault, routes the delegated protocol fee, and mints the NFT to the burner.

## Proven mainnet flow

The production reference integration has completed this full Robinhood Chain mainnet lifecycle:

1. The reference mint was deployed and source-verified.
2. The protocol Safe approved its exact runtime bytecode hash.
3. An eligible vault authorized one burner for that exact target.
4. The vault disconnected.
5. The burner minted one NFT.
6. `claimedByVault(vault)` increased from `0` to `1`.
7. NFT `#1` was owned by the burner.
8. The canonical FeeVault received exactly `0.00005 ETH`.
9. The vault later revoked the burner.
10. An independent on-chain read confirmed the authorization was `false` while the NFT and recorded claim remained intact.

Reference mint:

`0x94FEa8Ea67f8B2B72c9c196aCAFd2C0471F30309`

Protected mint transaction:

`0x4ef6413bba6299288a39a842dc568cc1131509cb22a55548e8b2ab82d4a4a239`

Revocation transaction:

`0xf3bd2c4a2f1e8619f8fd35140847a49496c42ab72059d68e100a1613a395593b`

## Robinhood Chain mainnet

- Chain ID: `4663`
- Native gas token: `ETH`
- Public RPC: `https://rpc.mainnet.chain.robinhood.com`
- Explorer: `https://robinhoodchain.blockscout.com`

### Canonical protocol contracts

| Component | Address |
| --- | --- |
| RegistryV2 | `0xA6D25fD2214C6c136599F65bDc07DE77A5f67d6e` |
| FeeVaultV2 | `0xd3e873CCE414a0a24F9E888236faCe40ab6C02DA` |
| OfficialIntegrationRegistry | `0xb8d1f6F919B5A19B1EA1036f2358f21184f4C282` |
| Protocol Safe / treasury | `0xA70bDD510A6D339318FdBCaFb60862FDD39AbA0b` |
| Production reference mint | `0x94FEa8Ea67f8B2B72c9c196aCAFd2C0471F30309` |

The protocol Safe is a **2-of-3 multisig**.

### Fee model

Authorization and revocation cost only normal network gas.

A successful **delegated protected mint** pays exactly:

`0.00005 ETH × quantity`

to the canonical `RHBurnerPassFeeVaultV2`.

A direct vault self-mint has no RHBurnerPass protocol fee under the current reference gate.

The fee amount is fixed in FeeVaultV2 bytecode and the FeeVault treasury is immutable.

If the outer mint transaction reverts, the fee collection reverts with it.

## Core contracts

- `RHBurnerPassRegistryV2.sol` — stores vault → burner → target authorization and refuses new authorization for targets that are not official integrations.
- `RHBurnerPassFeeVaultV2.sol` — immutable fixed-fee collector.
- `RHBurnerPassOfficialIntegrationRegistry.sol` — Safe-controlled registry of reviewed integrations pinned to exact runtime bytecode hashes and canonical protocol bindings.
- `RHBurnerPassMintGate.sol` — reusable integration helper.
- `RHBurnerPassReferenceMint.sol` — mainnet reference ERC-721 integration.
- `RHBurnerPassDemoMint.sol` — legacy/testnet reference mint.

## Integrate RHBurnerPass

Collection developers should start with:

**[INTEGRATION.md](INTEGRATION.md)**

The simplest approach is to inherit `RHBurnerPassMintGate`, key eligibility/allocation usage to the vault, and route the delegated fee through the canonical FeeVault.

After deployment, the integration must be reviewed and approved by the protocol Safe before the live portal will allow new vault → burner authorizations for that target.

## What “official integration” means

An official integration is a deployed target that:

- exposes the expected RHBurnerPass Registry and FeeVault bindings;
- points to the canonical mainnet RegistryV2 and FeeVaultV2;
- has a reviewed runtime code hash;
- was approved by the protocol Safe.

Approval is target-contract specific.

It is **not** a guarantee that a collection, website, team, metadata server, or unrelated contract is safe.

Upgradeable proxies require additional review because proxy runtime bytecode alone does not pin the implementation.

## Critical limitation

RHBurnerPass **cannot retrofit arbitrary already-deployed mint contracts** that base eligibility only on `msg.sender`.

The collection mint contract must integrate RHBurnerPass (or implement equivalent compatible logic) so that eligibility and allocation are resolved to the vault while the burner sends the transaction.

## Local development

```bash
npm install
npm run contracts:compile
npm test
npm run build
npm run dev
```

Windows full verification:

```powershell
.\VERIFY_HARDENING.cmd
```

Do not use `npm audit fix --force` blindly; dependency-major changes should be reviewed and tested deliberately.

## Security boundaries

RHBurnerPass reduces the need for a valuable vault wallet to connect to a participating collection's mint frontend.

It does **not**:

- make a malicious mint contract safe;
- make a malicious frontend safe;
- protect a user who signs unrelated malicious transactions;
- retrofit incompatible contracts;
- replace contract review or an independent audit.

Never enter a seed phrase or private key into the RHBurnerPass website, repository, issue tracker, or documentation.

See **[SECURITY.md](SECURITY.md)**.

## Source verification

The mainnet protocol contracts and the production reference mint are publicly source-verified on Robinhood Chain Blockscout.

Reproducible Standard JSON verification inputs are stored under:

`verification/`

The reference deployment record is stored at:

`deployments/reference-mainnet.json`

## Testnet

Legacy testnet deployments remain available for development and regression testing.

- Chain ID: `46630`
- RPC: `https://rpc.testnet.chain.robinhood.com`
- Explorer: `https://explorer.testnet.chain.robinhood.com`

Testnet demo tooling should not be treated as the production integration path.

## License

MIT.

## RHBurnerPass v2 self-service development

The repository now includes an **undeployed v2 development stack** for permissionless, Factory-created protected mints with a fixed 90% protocol / 10% integrator split of the existing 0.00005 ETH delegated-mint fee. The currently deployed v1 mainnet contracts remain unchanged.

Start with `V2_ARCHITECTURE.md` and `developer-kit/README.md`. Testnet protocol deployment uses `npm run deploy:v2:testnet`; after the Factory address is saved locally, developers can run `npm run mint:v2:testnet` for the local interactive mint builder.

Do not treat the v2 addresses as canonical until the testnet regression flow is completed and a separate mainnet deployment is intentionally performed.

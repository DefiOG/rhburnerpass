# RHBurnerPass

> **Don’t get burned. Use RHBurnerPass.**

RHBurnerPass is a target-scoped protected-mint protocol for **Robinhood Chain**. It lets a valuable vault wallet keep allowlist or NFT-holder eligibility while a low-value burner wallet performs the actual mint on a compatible collection contract.

**Independent community project. Not affiliated with or endorsed by Robinhood Markets, Inc.**

> **Status: RHBurnerPass v2.0.0 is live on Robinhood Chain mainnet. The v2 core contracts are deployed and source-verified, and the v2 Factory → vault authorization → burner mint flow has completed a successful mainnet smoke test. RHBurnerPass has not received an independent professional audit.**

## Live portal

Vault authorization portal:

`https://defiog.github.io/rhburnerpass/`

The RHBurnerPass portal is for the **vault wallet** to create, verify, or revoke an authorization for one exact compatible mint target.

Recommended user flow:

1. Connect the eligible vault.
2. Select or enter the exact canonical mint target.
3. Authorize the intended burner wallet.
4. Disconnect the vault.
5. Open the participating collection's mint frontend with the burner.
6. Mint from the burner.
7. Allocation usage remains keyed to the vault and the NFT is delivered to the burner.

The valuable vault does not need to remain connected to the collection's mint frontend.

## Why RHBurnerPass exists

Collectors often earn whitelist, allowlist, token-gated, or NFT-holder access from the same wallet that stores valuable assets.

A normal mint flow may ask that valuable wallet to connect directly to a collection frontend.

RHBurnerPass separates the roles:

- **vault** — owns eligibility and the allocation bucket;
- **burner** — sends the mint transaction and receives the NFT;
- **target mint** — the one exact compatible contract the authorization applies to.

For a delegated mint:

- eligibility resolves to the vault;
- claim accounting remains keyed to the vault;
- `msg.sender` is the burner;
- the NFT recipient is the burner;
- changing burners does not reset the vault's allocation.

## RHBurnerPass v2.0.0 mainnet

Robinhood Chain mainnet:

- Chain ID: `4663`
- Native gas token: `ETH`
- Public RPC: `https://rpc.mainnet.chain.robinhood.com`
- Explorer: `https://robinhoodchain.blockscout.com`

### Canonical v2 contracts

| Component | Address |
| --- | --- |
| RHBurnerPassFactoryV2 | `0x48bf0bfa8544acce021548b4d0a60b87a6358127` |
| RHBurnerPassRegistryV3 | `0x586a5e67439f2fa4ab51d511c8636788637b3b5f` |
| RHBurnerPassFeeVaultV3 | `0x2d86eeb6c2f8b5cdc29cdd0a4ad313109457d8f6` |
| Protocol Safe / treasury | `0xA70bDD510A6D339318FdBCaFb60862FDD39AbA0b` |

The protocol Safe is a **2-of-3 multisig**.

### v2 fee model

Authorization and revocation cost only normal network gas.

A successful **delegated burner mint** pays exactly:

`0.00005 ETH × quantity`

The v2 split is fixed as:

- **90% protocol:** `0.000045 ETH` per NFT
- **10% integration partner:** `0.000005 ETH` per NFT

A direct vault self-mint has **no RHBurnerPass delegated fee**.

Partner fees accrue to the payout address associated with the Factory-created integration. Changing the payout address affects future accrual only; already-accrued partner fees remain credited to the prior payout address.

If the outer mint transaction reverts, the RHBP fee path reverts with it.

## Permissionless Factory integration

The standard v2 integration path is the canonical Factory.

Developers do **not** need to wait for manual Safe approval when deploying through the canonical RHBurnerPass Factory.

The Factory creates a known-compatible protected mint and records its integration ownership and partner payout on-chain.

The standard developer flow is:

1. Install the repository dependencies.
2. Compile the contracts.
3. Prepare an allowlist.
4. Run the local Mint Builder.
5. Enter collection name, symbol, supply, price, treasury, partner payout, metadata URI, and allowlist.
6. Review the deployment summary.
7. Deploy through the canonical Factory.
8. Use the generated deployment/config output to build or host the collection's mint frontend.

Start here:

**[developer-kit/README.md](developer-kit/README.md)**

Architecture details:

**[V2_ARCHITECTURE.md](V2_ARCHITECTURE.md)**

## v2 core contracts

- `RHBurnerPassFactoryV2.sol` — permissionless canonical deployment path for compatible protected mints.
- `RHBurnerPassRegistryV3.sol` — stores vault → burner → target authorization and restricts new authorizations to canonical integrations.
- `RHBurnerPassFeeVaultV3.sol` — receives the fixed delegated fee, tracks protocol and partner shares, and protects partner liabilities.
- `RHBurnerPassMintTemplateV2.sol` — compatible Factory-deployed ERC-721 mint template.

### Important v2 behavior

- New authorizations require a canonical integration.
- Revocation remains available even if an integration is later blocked.
- Burner rotation does not reset the vault allocation bucket.
- Integration ownership can be transferred using the protocol's two-step ownership flow.
- Partner payout cannot be redirected by a collector during an individual mint transaction.
- The protocol can emergency-block an integration from receiving new authorizations.

## Proven v2 mainnet flow

The v2 mainnet deployment has completed a production smoke test using a canonical Factory-created mint.

Smoke-test mint:

`0xCA371B745edF27C090a7C5DA4e379a3b3e392284`

Factory create-mint transaction:

`0x06f0cb0ff071cf811814e2de963e0b3492482c346a7b22cbc05d5b4130c61c0d`

Vault authorization transaction:

`0xcd60c49c6dd9ed6115a14925a4ab57d850b6017c772304cc780c2d70ec1f2647`

Delegated burner mint transaction:

`0x2bc5df102b64a85d40bf9edf04a19d16a5b6454b3f60e8b8c1eb1ab8499cbeba`

The smoke test demonstrated the live v2 Factory/Registry/FeeVault authorization and delegated-mint path on Robinhood Chain mainnet.

Deployment records:

`deployments/v2-mainnet.json`

Reproducible verification inputs:

`verification/v2-mainnet/`

## Mint frontend model

RHBurnerPass does not require every collection to mint from one centralized RHBurnerPass page.

The intended production model is:

- the RHBurnerPass portal handles trusted **vault authorization and revocation**;
- each collection or launchpad operates its own **burner-facing mint frontend**;
- the local Mint Builder and developer kit provide the compatible contract/config path.

A mint frontend needs the burner wallet, eligible vault, vault allocation information, and Merkle proof.

For the v2 mint template, allocation usage remains keyed to the vault while the NFT recipient is `msg.sender`.

## Security boundaries

RHBurnerPass reduces the need for a valuable vault wallet to connect to a participating collection's mint frontend.

It does **not**:

- make a malicious mint contract safe;
- make a malicious frontend safe;
- protect a user who signs unrelated malicious transactions;
- retrofit arbitrary incompatible contracts;
- replace contract review;
- replace an independent professional audit.

An authorization is target-specific. It is not a blanket approval for unrelated contracts.

Never enter a seed phrase or private key into the RHBurnerPass website, repository, issue tracker, or documentation.

See **[SECURITY.md](SECURITY.md)**.

## Critical limitation

RHBurnerPass cannot retrofit arbitrary already-deployed mint contracts that key eligibility only to `msg.sender`.

The target mint contract must integrate RHBurnerPass-compatible logic so eligibility and claim accounting can resolve to the vault while the burner sends the transaction and receives the NFT.

## Source verification

The live v2 mainnet core contracts are source-verified on Robinhood Chain Blockscout.

Reproducible Standard JSON verification inputs are stored under:

`verification/v2-mainnet/`

The v2 mainnet deployment record is stored at:

`deployments/v2-mainnet.json`

## Local development

```bash
npm install
npm run contracts:compile
npm test
npm run build
npm run dev
```

Do not use `npm audit fix --force` blindly; dependency-major changes should be reviewed and tested deliberately.

## Legacy v1 mainnet

The original v1 mainnet contracts remain deployed and are intentionally preserved. RHBurnerPass v2 did **not** redeploy over, upgrade, or destroy the v1 stack.

Legacy v1 mainnet contracts:

| Component | Address |
| --- | --- |
| RegistryV2 | `0xA6D25fD2214C6c136599F65bDc07DE77A5f67d6e` |
| FeeVaultV2 | `0xd3e873CCE414a0a24F9E888236faCe40ab6C02DA` |
| OfficialIntegrationRegistry | `0xb8d1f6F919B5A19B1EA1036f2358f21184f4C282` |
| Production reference mint | `0x94FEa8Ea67f8B2B72c9c196aCAFd2C0471F30309` |

v1 used a manually approved official-integration model. v2's standard production path is the permissionless canonical Factory.

The v1 delegated fee was also exactly `0.00005 ETH/NFT`.

## Testnet

Robinhood Chain Testnet:

- Chain ID: `46630`
- RPC: `https://rpc.testnet.chain.robinhood.com`
- Explorer: `https://explorer.testnet.chain.robinhood.com`

Legacy and v2 testnet deployments remain useful for development and regression testing, but the canonical public production path is now **RHBurnerPass v2.0.0 on Robinhood Chain mainnet**.

## License

MIT.

## Collection SDK (v2.2 development)

The repository now includes a collection-side SDK under `packages/` so existing React/wagmi mint pages can embed RHBurnerPass without reimplementing Factory validation, permission checks, fee quoting, and protected mint preparation.

Start with [`SDK_INTEGRATION.md`](SDK_INTEGRATION.md). The SDK does not change the deployed v2 contracts, protocol fee, or vault-keyed allocation model.

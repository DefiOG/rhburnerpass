# RHBurnerPass

> **Don’t get burned. Use RHBurnerPass.**

RHBurnerPass is an experimental safe-mint protocol for **Robinhood Chain**. It lets a valuable vault wallet keep the allowlist/NFT-holder identity while a low-value burner wallet is the wallet that interacts with a compatible mint contract.

**Independent community project. Not affiliated with or endorsed by Robinhood Markets, Inc.**

> **Status: v0.1 alpha / unaudited / Robinhood Chain Testnet only. Do not use valuable wallets or real funds.**

## The problem

Collectors often earn whitelist access from a wallet that also holds valuable NFTs and assets. Connecting that same wallet to an unfamiliar mint page increases exposure to malicious signatures, approvals, and frontends.

RHBurnerPass separates:

- **vault** — holds eligibility and stays away from the mint site;
- **burner** — sends the mint transaction;
- **target mint** — the only contract that burner authorization applies to.

A compatible mint resolves the whitelist proof to the vault, verifies the burner is authorized, and counts the allocation against the **vault**, not the burner.

## Frontend boundaries

The default frontend is the trusted **vault authorization portal**. It connects the vault only long enough to create, verify, or revoke a target-scoped authorization. The vault should disconnect when that task is complete.

The burner-side reference mint is isolated at `#/demo`. It exists for testnet integration work and is not part of the normal RHBurnerPass portal journey. In production, the burner connects on the participating collection's separate mint frontend.

Wallet state and connector lifecycles are managed by wagmi. The focused connection modal lists EIP-6963 wallets as distinct connectors; account and chain changes update the session automatically, and protocol writes use the same wallet client and account displayed during review. Set `VITE_WALLETCONNECT_PROJECT_ID` to enable WalletConnect/mobile QR sessions; injected browser wallets do not require it.

## Protocol contracts

Current testnet contracts remain available for compatibility:

- `RHBurnerPassRegistry.sol` — v0.1 vault → burner → target authorization registry.
- `RHBurnerPassFeeVault.sol` — already-deployed v0.1 fee collector configured at `0.00005 ETH/NFT`.

Production-hardening contracts:

- `RHBurnerPassFeeVaultV2.sol` — fee permanently fixed in bytecode at exactly `0.00005 ETH/NFT`; immutable treasury.
- `RHBurnerPassOfficialIntegrationRegistry.sol` — multisig-controlled official-target registry with exact runtime bytecode-hash pinning.
- `RHBurnerPassRegistryV2.sol` — refuses new burner authorizations to non-official targets while always allowing revocation.
- `RHBurnerPassMintGate.sol` — reusable integration helper.
- `RHBurnerPassDemoMint.sol` — testnet ERC-721 Merkle allowlist reference integration.

### Fee model

Authorization and revocation are free aside from network gas. Official protected-mint integrations collect exactly **0.00005 ETH per NFT successfully minted through an authorized burner**. The production-design FeeVault fixes that fee in bytecode, while the treasury is supplied once at deployment and then remains immutable.

If the outer mint fails, the protocol-fee call reverts with it, so a failed mint does not leave a successfully collected protocol fee.

## Robinhood Chain Testnet

- Chain ID: `46630`
- Native gas token: `ETH`
- Public RPC: `https://rpc.testnet.chain.robinhood.com`
- Explorer: `https://explorer.testnet.chain.robinhood.com`

The public RPC is suitable for testing but rate-limited; use a production provider later.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run contracts:compile
npm run dev
```

Run the frontend checks with:

```bash
npm test
npm run build
```

Do **not** paste a production wallet private key into the frontend or repository. Deployment scripts use a local environment variable and should only use a disposable testnet deployer during alpha.

## Deploy the protocol to testnet

Set these environment variables locally:

```bash
export DEPLOYER_PRIVATE_KEY=0x...
export TREASURY_ADDRESS=0x...
export PROTOCOL_OWNER_ADDRESS=0x...   # multisig recommended for production
# Fee is fixed in contract bytecode; there is no fee environment variable.
export RH_RPC_URL=https://rpc.testnet.chain.robinhood.com
```

Then:

```bash
npm run contracts:compile
npm run deploy:protocol
```

The production-design deploy script prints three canonical addresses: Registry V2, FeeVault V2, and Official Integration Registry. The official registry is bound one time to that Registry deployment.

For the **existing testnet deployment**, do not redeploy the old Registry/FeeVault just to add official-target enforcement. Instead run:

```bash
npm run contracts:compile
npm run deploy:official-registry
npm run approve:integration
```

`deploy:official-registry` binds the new official registry to the Registry and FeeVault already present in `public/config.json` and writes the new public address into the config. `approve:integration` defaults to the configured demo mint.

## Build a demo allowlist

```bash
cp allowlist.example.json allowlist.json
# replace the example addresses with TESTNET vault wallets
npm run allowlist
```

This writes `allowlist-output.json`, including the Merkle root and a proof for each vault.

## Deploy the demo mint

Set:

```bash
export RHBP_REGISTRY_ADDRESS=0x...
export RHBP_FEE_VAULT_ADDRESS=0x...
export MERKLE_ROOT=0x...
export PROJECT_TREASURY_ADDRESS=0x...
export MINT_PRICE_WEI=0
```

Then:

```bash
npm run deploy:demo
```

## Test flow

1. Put the **vault test wallet** in `allowlist.json` and generate the tree.
2. Deploy or attach the Official Integration Registry and approve the demo mint.
3. Open the RHBurnerPass UI with the vault test wallet.
4. Enter a burner address and the approved demo mint contract address.
5. Authorize the burner. The portal checks official approval, runtime code hash, Registry, and FeeVault before submitting.
6. Disconnect the vault. It should not need to visit the mint app again.
7. Open `#/demo` with the burner and call the reference mint using the vault address, allocation and proof.
8. Confirm the NFT goes to the burner while `claimedByVault(vault)` increases.
9. Confirm the fee vault received `0.00005 ETH × quantity`.
10. Reconnect the vault to RHBurnerPass and revoke the burner.

## Critical limitation

RHBurnerPass **cannot retrofit arbitrary already-deployed mints**. The target mint must integrate the registry/gate logic (or implement equivalent logic itself). That is why the repository includes a reference integration for collection developers.

## Security notes

- Never request seed phrases or private keys from users.
- Keep authorization scoped to one target mint contract.
- Count claims against vault identity, not burner identity.
- Treat every v0.x deployment as experimental until independently audited.
- Mainnet deployment should use a dedicated multisig treasury and a professional audit/review.
- The treasury deployment input becomes immutable on-chain; `.env` cannot redirect it after deployment.
- Official integrations must use the canonical RHBurnerPass Registry and FeeVault and be approved at an exact runtime bytecode hash. A fork that removes the fee is not an official integration.
- Future Registry V2 deployments enforce official-target status on-chain before creating new burner delegations.
- The Official Integration Registry owner should be a multisig; it can curate integrations but cannot alter the FeeVault fee or treasury.
- Upgradeable proxy mints require explicit review because a proxy can change implementation without changing proxy runtime bytecode.

## License

MIT.

## Publish the test site with GitHub Pages

The repo includes `.github/workflows/pages.yml`. After pushing to GitHub:

1. Open **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Push to `main` (or run the workflow manually).
4. GitHub Pages will publish the Vite build.

The site reads public deployment addresses at runtime from `public/config.json`, so you do not need to put contract addresses in build secrets. After deployment, edit only these fields:

```json
"contracts": {
  "registry": "0x...",
  "feeVault": "0x...",
  "demoMint": "0x...",
  "officialIntegrationRegistry": "0x..."
}
```

Commit that edit and Pages will republish automatically.

### Mobile wallet testing

Configure a public `VITE_WALLETCONNECT_PROJECT_ID` for QR/deep-link sessions on mobile. A wallet's in-app browser may also provide an injected EIP-6963 provider. Never paste a seed phrase or private key into the site.

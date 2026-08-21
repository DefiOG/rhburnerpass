# RHBurnerPass v2.2 Collection SDK — Review Handoff

This merge candidate adds collection-side integration tooling without changing Solidity contracts or deployed protocol addresses.

## Added

- `packages/sdk/` — framework-agnostic TypeScript SDK
- `packages/react/` — React/wagmi integration layer
- `examples/protected-mint-widget/` — minimal collection-site example
- `SDK_INTEGRATION.md` — developer guide
- `tests/v2-sdk.test.ts` — mainnet-binding + handoff URL invariants

## Portal handoff improvement

The existing v2.1 portal now accepts:

- `?collection=0x...` — already canonical-validated before selection
- `&burner=0x...` — prefills the Mint Wallet, still shown in the review screen
- `&return=https://...` — after successful permission, shows an explicit button with the destination hostname

It does not silently auto-redirect to a return URL.

## Security invariants preserved

- no Solidity files changed
- Factory: `0x48bf0bfa8544acce021548b4d0a60b87a6358127`
- RegistryV3: `0x586a5e67439f2fa4ab51d511c8636788637b3b5f`
- FeeVaultV3: `0x2d86eeb6c2f8b5cdc29cdd0a4ad313109457d8f6`
- delegated RHBP fee remains exactly `0.00005 ETH/NFT`
- eligibility + claims remain keyed to the Safe Wallet
- Mint Wallet remains transaction sender + NFT recipient
- SDK never generates, stores, exports, or recovers private keys
- canonical status is read from the live Factory/bindings, not trusted from frontend metadata

## Morning verification on the real repo

After copying the merge candidate into the real Git repo, run:

```bat
npm test
npm run build
npm run sdk:build
git status
```

Expected SDK test adds 3 assertions to the existing suite.

This environment did not have a complete installed `node_modules`, so the final npm commands must be run in the real local repo before commit/push.

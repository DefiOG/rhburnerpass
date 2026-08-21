# RHBurnerPass v2.2 Collection SDK

RHBurnerPass v2.2 adds a collection-side SDK so projects can keep collectors on their own branded mint page while using the live RHBurnerPass security model underneath.

No Solidity or deployed protocol behavior is changed by this SDK.

## Packages

### `@rhburnerpass/sdk`

Framework-agnostic TypeScript client. It provides:

- canonical Factory + Registry + FeeVault validation;
- `isCanonicalCollection()` / `assertCanonicalCollection()`;
- `getAuthorization()`;
- `getDelegatedFee()`;
- `getClaimedByVault()`;
- `getRemainingAllocation()`;
- `getMintSummary()`;
- `quoteProtectedMint()`;
- `prepareProtectedMint()`;
- `buildAuthorizationUrl()` for the trusted portal handoff.

### `@rhburnerpass/react`

React/wagmi layer. It provides:

- `<RHBPProvider>`;
- `useProtectedMintStatus()`;
- `<ProtectedMintStatus>`;
- `<ProtectedMintButton>`.

A collection can add protected minting without reimplementing Registry checks, Factory validation, fee quoting, or the vault/burner handoff.

## 5-minute React integration

The collection still owns its allowlist/backend and resolves:

- eligible Safe Wallet address;
- `maxAllocation`;
- Merkle proof.

Then:

```tsx
import {
  RHBPProvider,
  ProtectedMintButton,
  ProtectedMintStatus,
} from '@rhburnerpass/react'

export function MintCard({ vault, maxAllocation, proof }) {
  return (
    <RHBPProvider>
      <ProtectedMintStatus
        collection="0xYourFactoryMint"
        vault={vault}
        maxAllocation={maxAllocation}
      />

      <ProtectedMintButton
        collection="0xYourFactoryMint"
        vault={vault}
        maxAllocation={maxAllocation}
        proof={proof}
      />
    </RHBPProvider>
  )
}
```

If the connected Mint Wallet does not have permission, the button builds a trusted portal URL containing:

- `collection=0x...`;
- `burner=0x...` (the currently connected Mint Wallet);
- `return=https://collection-site/...`.

The portal validates the collection on-chain before accepting the preselection. It prefills the Mint Wallet but still shows it in the confirmation screen. After permission succeeds, the user gets an explicit button showing the exact return hostname before leaving the RHBP portal.

There is no automatic redirect to an unreviewed destination.

## What the SDK does not do

It does not:

- generate or custody private keys;
- create a burner wallet;
- bypass the canonical Factory;
- calculate a replacement protocol fee;
- move allocation accounting away from the Safe Wallet;
- make an unsafe collection contract or frontend safe.

All security-sensitive state remains on-chain.

## Mainnet defaults

- Chain ID: `4663`
- Factory: `0x48bf0bfa8544acce021548b4d0a60b87a6358127`
- RegistryV3: `0x586a5e67439f2fa4ab51d511c8636788637b3b5f`
- FeeVaultV3: `0x2d86eeb6c2f8b5cdc29cdd0a4ad313109457d8f6`
- Delegated RHBP fee: exactly `0.00005 ETH/NFT`
- Protocol / integration partner split: `90% / 10%`

Direct Safe Wallet self-mints remain fee-free under the deployed v2 mint behavior.

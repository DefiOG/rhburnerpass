# @rhburnerpass/react

Drop-in React integration for collection mint pages that already use `wagmi`.

```tsx
import { RHBPProvider, ProtectedMintButton, ProtectedMintStatus } from '@rhburnerpass/react'

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

Behavior:

- validates the collection against the canonical Factory and protocol bindings;
- checks `registry.isAuthorized(vault, connectedMintWallet, collection)`;
- if permission is missing, sends the user to the trusted RHBP portal with the collection and connected Mint Wallet prefilled;
- the portal can return the user to the collection site after they grant permission;
- when permission exists, reads the live mint price + RHBP fee and submits `mint(vault,maxAllocation,quantity,proof)` from the Mint Wallet;
- allocation remains keyed to the Safe Wallet and the NFT recipient remains the Mint Wallet.

The component does not create wallets, store private keys, or calculate protocol fee splits locally.

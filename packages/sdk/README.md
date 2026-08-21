# @rhburnerpass/sdk

Framework-agnostic TypeScript helpers for RHBurnerPass v2 canonical Factory mints.

The SDK is an interface layer, not a source of truth. Canonical status, authorization, fee quotes, claims, and mint parameters are read from the live contracts.

```ts
import { createRHBurnerPassClient, buildAuthorizationUrl } from '@rhburnerpass/sdk'

const rhbp = createRHBurnerPassClient()

const canonical = await rhbp.isCanonicalCollection(collection)
const authorized = await rhbp.getAuthorization(vault, burner, collection)
const remaining = await rhbp.getRemainingAllocation(collection, vault, maxAllocation)
const prepared = await rhbp.prepareProtectedMint({
  collection,
  burner,
  vault,
  maxAllocation,
  quantity: 1n,
  proof,
})

const authorizeUrl = buildAuthorizationUrl({
  collection,
  burner,
  returnUrl: window.location.href,
})
```

`prepareProtectedMint()` returns the exact payable value from the collection's live `mintPrice()` and `rhBurnerPassFee(...)` reads. The delegated fee remains enforced by the deployed protocol; the SDK does not calculate or override the protocol split.

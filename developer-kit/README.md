# RHBurnerPass v2 Developer Kit

RHBurnerPass v2 is a self-service protected-mint deployment system. Developers do not wait for manual protocol approval when they deploy through the canonical Factory.

## Fast path
1. `npm install`
2. `npm run contracts:compile`
3. Put a disposable testnet `DEPLOYER_PRIVATE_KEY` and canonical `RHBP_V2_FACTORY_ADDRESS` in local `.env`.
4. Create `allowlist.json` using `allowlist.example.json`.
5. Run `npm run mint:v2:testnet`.
6. The local wizard asks for collection name/symbol, supply, mint price, project treasury, 10% partner payout, metadata base URI, and allowlist file.
7. Review and type `DEPLOY`.
8. The Factory deploys and automatically registers the canonical mint. Output is written under `mint-deployments/<mint-address>/`.

## Revenue share
For delegated burner mints only, the fixed RHBP fee is 0.00005 ETH/NFT: 90% protocol and 10% the mint's on-chain partner payout. Direct vault mints pay no RHBP delegated fee.

The integration owner may update the payout for future fees. Already-accrued fees stay credited to the old payout.

## Mint page
A mint page needs the burner wallet, eligible vault, vault `maxAllocation`, and Merkle proof. Call payable `mint(vault,maxAllocation,quantity,proof)`. Read `rhBurnerPassFee(burner,vault,quantity)` and `mintPrice()` for the exact payment.

NFT recipient is `msg.sender`. Allocation usage is always `claimedByVault[vault]`. See `MintPageExample.tsx`.

## v2.2 collection SDK

For an existing React/wagmi collection frontend, start with [`SDK_INTEGRATION.md`](../SDK_INTEGRATION.md).

The collection-side SDK validates the canonical Factory bindings, checks Safe Wallet → Mint Wallet permission, quotes the exact payable value, and prepares/submits the protected mint. If permission is missing, it sends the collector to the trusted RHBP portal with the collection and currently connected Mint Wallet prefilled, then provides an explicit return-to-collection handoff.

Source packages live under:

- `packages/sdk/` — framework-agnostic client
- `packages/react/` — React/wagmi hooks and components
- `examples/protected-mint-widget/` — minimal integration example

# RHBurnerPass v2 Testnet Runbook

Do not change the existing mainnet frontend configuration while testing v2.

1. Start from a disposable Robinhood Chain testnet deployer and local `.env`.
2. `npm install`
3. `npm run contracts:compile`
4. `npm test`
5. Confirm `PROTOCOL_OWNER_ADDRESS` and `TREASURY_ADDRESS` are intentional testnet addresses.
6. `npm run deploy:v2:testnet`
7. Save `RHBP_V2_FACTORY_ADDRESS`, `RHBP_V2_REGISTRY_ADDRESS`, and `RHBP_V2_FEE_VAULT_ADDRESS` into local `.env`.
8. Prepare `allowlist.json` with a real vault test address and allocation.
9. `npm run mint:v2:testnet`; enter a burner-safe test collection and partner payout address.
10. From the vault, authorize Burner A for the exact Factory-created mint using RegistryV3.
11. Mint with Burner A and confirm NFT owner is Burner A, `claimedByVault[vault]` increments, and FeeVaultV3 accrues 90/10.
12. Revoke Burner A, authorize Burner B, mint again, and confirm the same vault allocation bucket is used.
13. Confirm an unauthorized burner fails.
14. Confirm direct vault mint consumes the same allocation and charges zero RHBP delegated fee.
15. Update the integration payout address, mint again, and confirm only future partner fees accrue to the new payout.
16. Claim the old and new partner balances; funds must go only to the credited payout addresses.
17. Withdraw protocol fees from the treasury and confirm partner liabilities remain untouched.
18. Emergency-block the test mint and confirm new delegated mints cannot collect fees.

Only after all checks pass should mainnet deployment be considered. Mainnet scripts require separate explicit confirmation strings and contract-wallet owner/treasury addresses.

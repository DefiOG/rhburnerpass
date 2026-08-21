RHBurnerPass v2 — Release Candidate UI Patch
=============================================

Extract this patch over the CURRENT working v2 testnet project.

This patch changes UI files only. It does NOT modify:
- Solidity contracts
- deployed addresses
- .env
- deployment scripts
- protocol accounting

Improvements:
- Vault authorization success now carries the vault/mint/burner context into the mint page.
- Vault flow ends with a clear "Continue to burner mint" action.
- Wallet connector messaging changes between vault and burner roles.
- Mint page warns when the wrong burner wallet is connected.
- Mint page automatically uses the authorized vault/mint from the same browser session.
- Quantity has simple +/- controls and respects remaining vault allocation.
- Mint quote clearly shows collection price, RHBP fee, total, and 90/10 revenue split.
- Developer section explains permissionless Factory deployment and the 10% partner incentive.

Run after extracting:
  npm run build
  npm test
  .\RUN_V2_PORTAL_TESTNET.cmd

Recommended smoke test:
1. Connect vault.
2. Enter burner and canonical mint.
3. Authorize.
4. Click Continue to burner mint.
5. Disconnect/switch to burner.
6. Confirm allocation and authorization load automatically.
7. Mint one NFT.

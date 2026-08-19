# RHBurnerPass Mainnet Deployment Safety

Do not deploy mainnet until the contracts have received an independent professional review.

## Network

- Robinhood Chain mainnet chain ID: `4663`
- Native gas token: `ETH`
- Public RPC: `https://rpc.mainnet.chain.robinhood.com`
- Explorer: `https://robinhoodchain.blockscout.com`

The public RPC is rate-limited. Prefer a production RPC provider for deployment and production operations.

## Mainnet owner / treasury requirements

The hardened deployment script refuses mainnet deployment unless:

1. `--network=mainnet` is explicit.
2. The RPC reports chain ID `4663`.
3. `PROTOCOL_OWNER_ADDRESS` is explicitly configured.
4. `TREASURY_ADDRESS` is explicitly configured.
5. Neither owner nor treasury is the deployer EOA.
6. Both owner and treasury have deployed contract code on Robinhood Chain (multisig/contract-controlled wallets).
7. `CONFIRM_MAINNET_DEPLOY=RHBURNERPASS_MAINNET` is deliberately set.

The protocol fee remains exactly `0.00005 ETH` per delegated NFT in `RHBurnerPassFeeVaultV2` bytecode. The treasury address is immutable after FeeVaultV2 deployment.

## Local preparation

Keep the working testnet `.env` separate. Create a new mainnet-only file:

```powershell
Copy-Item .env.mainnet.example .env.mainnet
notepad .env.mainnet
```

Do not paste secrets into chat, GitHub, issues, or frontend files.

Compile and verify before deployment:

```powershell
npm run contracts:compile
npm test
npm run build
```

The mainnet command is intentionally locked:

```powershell
npm run deploy:protocol:mainnet
```

It will refuse to send transactions until every safety condition above passes.

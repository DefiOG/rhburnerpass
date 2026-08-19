# RHBurnerPass Mainnet Deployment Record

This file records the canonical RHBurnerPass deployment on **Robinhood Chain mainnet**.

> The deployment is live and source-verified. It has passed controlled on-chain verification and a complete protected-mint/revocation lifecycle through the production reference integration. It has not received an independent professional audit.

## Network

```text
Network: Robinhood Chain
Chain ID: 4663
Native gas token: ETH
Public RPC: https://rpc.mainnet.chain.robinhood.com
Explorer: https://robinhoodchain.blockscout.com
```

## Protocol Safe

```text
Safe:
0xA70bDD510A6D339318FdBCaFb60862FDD39AbA0b

Threshold:
2 of 3
```

Owners:

```text
0xeec6244D9FBCE601ce824A9594238e9C9b3770bE
0x2966c9Bb3eF150db20387f3eD5ab15DD2a7b2f29
0x980Ea39f124FdC7c79e7975280C1cc8Bf352C5C5
```

The Safe is both protocol owner and FeeVault treasury.

## Canonical contracts

### FeeVaultV2

```text
0xd3e873CCE414a0a24F9E888236faCe40ab6C02DA
```

Deployment transaction:

```text
0xd82337d2a0117dd91f824c5b86f35da2daa5dbff7c6d2c5f86449f16a565bd95
```

Deployment block:

```text
40252265
```

Delegated fee:

```text
0.00005 ETH per NFT
```

Treasury:

```text
0xA70bDD510A6D339318FdBCaFb60862FDD39AbA0b
```

### OfficialIntegrationRegistry

```text
0xb8d1f6F919B5A19B1EA1036f2358f21184f4C282
```

Deployment transaction:

```text
0xd6a326069397086fd3766202da3d705f9c37ec7c9595b88c7e82c2142001c1d8
```

Deployment block:

```text
40252270
```

Owner:

```text
0xA70bDD510A6D339318FdBCaFb60862FDD39AbA0b
```

### RegistryV2

```text
0xA6D25fD2214C6c136599F65bDc07DE77A5f67d6e
```

Deployment transaction:

```text
0x17eb8ec83cc9d3e40e9bdc16c04428658e371a7e58589b6199c995f681b3d082
```

Deployment block:

```text
40252276
```

### Canonical Registry binding

```text
0x4d79acfe74512d8835511966b165e81d68997e4293ae3fa718801d14681c08a6
```

Binding block:

```text
40252282
```

## Runtime code hashes

```text
FeeVaultV2
0x91e3aafe39e83afa191518c8d90c4f3bfc55b65e1b73e73b185a8122a62ae640

OfficialIntegrationRegistry
0x6359de2b52163e0a0bff32e27c12ebacb0229ffcb93166937ded69fa5042fc31

RegistryV2
0xa306a27bf5dc63a35a701e0e3d3f2126a287e36f3598a4ec9c448bcdb1f3477e
```

## Production reference integration

Contract:

```text
RHBurnerPassReferenceMint
0x94FEa8Ea67f8B2B72c9c196aCAFd2C0471F30309
```

Deployment transaction:

```text
0xa6d231d263d93031094a90ba66d7752adba906599475775f54e142c71f4de8bc
```

Deployment block:

```text
40852037
```

Runtime code hash:

```text
0x359df5d26837ffca05ddd94e85ec92f85d624602db822411eacea56ced8b82c0
```

Official Safe approval execution transaction:

```text
0xd147f0b5484bc8961d56db304063dbaca1fa224c153111815c2529ca406b6922
```

Protected mint transaction:

```text
0x4ef6413bba6299288a39a842dc568cc1131509cb22a55548e8b2ab82d4a4a239
```

Revocation transaction:

```text
0xf3bd2c4a2f1e8619f8fd35140847a49496c42ab72059d68e100a1613a395593b
```

The protected mint test independently confirmed:

```text
transaction status: success
vault claimed: 0 -> 1
burner NFT balance: 0 -> 1
NFT #1 owner: burner
FeeVault balance increase: 0.00005 ETH
```

The subsequent revocation independently confirmed:

```text
revocation transaction: success
authorization active: false
vault claimed: 1
NFT #1 remained owned by the burner
```

## Source verification

All three canonical protocol contracts are publicly source-verified on Robinhood Chain Blockscout.

The production reference mint is also publicly source-verified.

Reproducible compiler inputs are stored in:

```text
verification/
```

Compiler used for the production verification artifacts:

```text
0.8.36+commit.8a079791
```

Optimizer:

```text
enabled
runs: 200
```

## Deployment EOA

The dedicated deployment/gas-paying EOA is:

```text
0x42A6ED4FEfffc4D0f12312453e6E36d42A1Eb16B
```

It is **not** the protocol owner, Safe owner, or FeeVault treasury.

Operational keys must remain local and excluded from source control.

## Deployment safety model

The mainnet tooling uses explicit chain checks, expected-address checks, deployment locks, immutable protocol bindings, read-only preflights, and post-deployment verification before administrative actions.

Safe actions use independent Safe-owner signatures and a separate execution step.

Do not place multiple Safe-owner private keys in one environment file.

## Portal

Production portal:

```text
https://defiog.github.io/rhburnerpass/
```

The portal runs against Robinhood Chain mainnet and RegistryV2.

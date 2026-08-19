# Security Policy

RHBurnerPass is live on Robinhood Chain mainnet.

The core contracts and production reference integration are publicly source-verified and have passed controlled end-to-end mainnet testing.

**RHBurnerPass has not received an independent professional audit.**

## Security goal

RHBurnerPass is designed to reduce one specific exposure:

> A valuable wallet should not need to connect to a participating collection's mint frontend solely because that wallet owns the allowlist or holder eligibility.

The vault uses the RHBurnerPass authorization portal to grant a target-scoped permission to a burner.

The burner then interacts with the compatible collection mint.

## What RHBurnerPass does not guarantee

RHBurnerPass does not guarantee that:

- a collection team is trustworthy;
- a collection website is safe;
- an approved target has no bugs;
- unrelated contracts are safe;
- a user's device or wallet extension is uncompromised;
- malicious signatures outside the intended RHBurnerPass flow are harmless.

Official integration status is not an endorsement of a project.

## Never do this

- Never enter a seed phrase into RHBurnerPass.
- Never enter a private key into the frontend.
- Never commit `.env`, `.env.local`, `.env.mainnet`, private keys, or Safe-owner signatures to GitHub.
- Never place two Safe-owner private keys together just to satisfy a 2-of-3 approval.
- Never approve a target without reviewing the exact deployed runtime code hash and canonical protocol bindings.
- Never assume a proxy runtime code hash pins the proxy implementation.

## Vault safety model

A vault authorization is scoped to:

```text
vault + burner + exact target contract
```

The burner cannot use that authorization for another target.

The vault can later revoke the scoped permission.

The vault remains responsible for reviewing the trusted RHBurnerPass portal transaction before signing.

## Official integration controls

Mainnet new-authorizations are restricted to targets approved by:

```text
RHBurnerPassOfficialIntegrationRegistry
0xb8d1f6F919B5A19B1EA1036f2358f21184f4C282
```

The registry owner is the protocol 2-of-3 Safe:

```text
0xA70bDD510A6D339318FdBCaFb60862FDD39AbA0b
```

Approval is pinned to an exact target runtime code hash and requires the target to report the canonical RHBurnerPass Registry and FeeVault.

## Immutable fee path

The canonical mainnet FeeVault is:

```text
0xd3e873CCE414a0a24F9E888236faCe40ab6C02DA
```

The delegated protocol fee is permanently fixed in FeeVaultV2 bytecode at:

```text
0.00005 ETH per NFT
```

The FeeVault treasury is immutable.

## Upgradeable integrations

Upgradeable proxies require explicit additional review.

A proxy's runtime bytecode can remain identical while its implementation changes, so a code-hash approval of the proxy alone is not sufficient to establish implementation immutability.

## Source verification

Canonical mainnet contracts and the production reference mint are publicly source-verified on Robinhood Chain Blockscout.

Verification artifacts are stored under:

```text
verification/
```

## Deployment keys

Deployment EOAs should be treated as operational tools, not protocol owners.

The canonical protocol owner/treasury is the Safe, not the deployment EOA.

Secrets should remain local and excluded from source control.

## Reporting

Open a GitHub issue for non-sensitive bugs.

Do **not** post private keys, seed phrases, exploitable undisclosed vulnerabilities, or other sensitive security material in a public issue.

Before broad third-party adoption, the project should establish a dedicated private security-reporting channel.

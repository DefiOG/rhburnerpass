# Protected mint widget example

This is the smallest collection-side integration: the collection keeps its own brand and page, while RHBurnerPass handles canonical verification, permission checks, authorization handoff, exact fee quoting, and the protected mint call.

The collection frontend is still responsible for resolving the eligible Safe Wallet, `maxAllocation`, and Merkle proof from its own allowlist/backend.

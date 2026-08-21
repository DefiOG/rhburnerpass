import type { Hex } from 'viem'
import { ProtectedMintButton, ProtectedMintStatus, RHBPProvider } from '@rhburnerpass/react'

const COLLECTION = '0xCA371B745edF27C090a7C5DA4e379a3b3e392284'

export function ProtectedMintExample({
  eligibleVault,
  maxAllocation,
  proof,
}: {
  eligibleVault: string
  maxAllocation: bigint
  proof: Hex[]
}) {
  return (
    <RHBPProvider>
      <section>
        <h2>Mint</h2>
        <ProtectedMintStatus collection={COLLECTION} vault={eligibleVault} maxAllocation={maxAllocation} />
        <ProtectedMintButton
          collection={COLLECTION}
          vault={eligibleVault}
          maxAllocation={maxAllocation}
          proof={proof}
          onConfirmed={(hash) => console.log('Protected mint confirmed', hash)}
        />
      </section>
    </RHBPProvider>
  )
}

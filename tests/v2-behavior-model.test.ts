import { describe, expect, it } from 'vitest'

const FEE = 50_000_000_000_000n
const PARTNER_BPS = 1_000n
const BPS = 10_000n

class FeeModel {
  protocolAccrued = 0n
  totalPartnerLiability = 0n
  partnerAccrued = new Map<string, bigint>()

  collect(partner: string, quantity: bigint) {
    if (quantity <= 0n) throw new Error('ZeroQuantity')
    const total = FEE * quantity
    const partnerShare = total * PARTNER_BPS / BPS
    const protocolShare = total - partnerShare
    this.partnerAccrued.set(partner, (this.partnerAccrued.get(partner) || 0n) + partnerShare)
    this.totalPartnerLiability += partnerShare
    this.protocolAccrued += protocolShare
    return { total, partnerShare, protocolShare }
  }

  claim(partner: string) {
    const amount = this.partnerAccrued.get(partner) || 0n
    if (amount === 0n) throw new Error('NothingToClaim')
    this.partnerAccrued.set(partner, 0n)
    this.totalPartnerLiability -= amount
    return amount
  }

  withdrawProtocol() {
    const amount = this.protocolAccrued
    if (amount === 0n) throw new Error('NothingToClaim')
    this.protocolAccrued = 0n
    return amount
  }
}

class MintModel {
  claimedByVault = new Map<string, bigint>()
  authorized = new Map<string, boolean>()

  key(vault: string, burner: string, target: string) {
    return `${vault}:${burner}:${target}`
  }

  setBurner(vault: string, burner: string, target: string, enabled: boolean) {
    this.authorized.set(this.key(vault, burner, target), enabled)
  }

  mint(vault: string, caller: string, target: string, quantity: bigint, maxAllocation: bigint) {
    if (caller !== vault && !this.authorized.get(this.key(vault, caller, target))) throw new Error('UnauthorizedBurner')
    const next = (this.claimedByVault.get(vault) || 0n) + quantity
    if (next > maxAllocation) throw new Error('AllocationExceeded')
    this.claimedByVault.set(vault, next)
    return caller
  }
}

describe('v2 behavioral model', () => {
  it('keeps the delegated fee exactly 0.00005 ETH and splits it 90/10', () => {
    const fees = new FeeModel()
    const r = fees.collect('partnerA', 1n)
    expect(r.total).toBe(50_000_000_000_000n)
    expect(r.partnerShare).toBe(5_000_000_000_000n)
    expect(r.protocolShare).toBe(45_000_000_000_000n)
  })

  it('attributes usage to the vault across burner rotation', () => {
    const mint = new MintModel()
    mint.setBurner('vault', 'burnerA', 'mint', true)
    expect(mint.mint('vault', 'burnerA', 'mint', 1n, 2n)).toBe('burnerA')
    mint.setBurner('vault', 'burnerA', 'mint', false)
    mint.setBurner('vault', 'burnerB', 'mint', true)
    expect(mint.mint('vault', 'burnerB', 'mint', 1n, 2n)).toBe('burnerB')
    expect(() => mint.mint('vault', 'burnerB', 'mint', 1n, 2n)).toThrow('AllocationExceeded')
    expect(mint.claimedByVault.get('vault')).toBe(2n)
  })

  it('keeps authorization scoped to one exact mint target', () => {
    const mint = new MintModel()
    mint.setBurner('vault', 'burner', 'mintA', true)
    expect(mint.mint('vault', 'burner', 'mintA', 1n, 2n)).toBe('burner')
    expect(() => mint.mint('vault', 'burner', 'mintB', 1n, 2n)).toThrow('UnauthorizedBurner')
  })

  it('keeps old partner accrual with the old payout after a payout change', () => {
    const fees = new FeeModel()
    fees.collect('oldPayout', 2n)
    fees.collect('newPayout', 1n)
    expect(fees.partnerAccrued.get('oldPayout')).toBe(10_000_000_000_000n)
    expect(fees.partnerAccrued.get('newPayout')).toBe(5_000_000_000_000n)
    expect(fees.totalPartnerLiability).toBe(15_000_000_000_000n)
  })

  it('cannot sweep partner liabilities when protocol revenue is withdrawn', () => {
    const fees = new FeeModel()
    fees.collect('partner', 3n)
    const partnerBefore = fees.partnerAccrued.get('partner')
    const liabilityBefore = fees.totalPartnerLiability
    expect(fees.withdrawProtocol()).toBe(135_000_000_000_000n)
    expect(fees.protocolAccrued).toBe(0n)
    expect(fees.partnerAccrued.get('partner')).toBe(partnerBefore)
    expect(fees.totalPartnerLiability).toBe(liabilityBefore)
  })

  it('partner claims reduce only that partner liability', () => {
    const fees = new FeeModel()
    fees.collect('partnerA', 1n)
    fees.collect('partnerB', 2n)
    expect(fees.claim('partnerA')).toBe(5_000_000_000_000n)
    expect(fees.partnerAccrued.get('partnerA')).toBe(0n)
    expect(fees.partnerAccrued.get('partnerB')).toBe(10_000_000_000_000n)
    expect(fees.totalPartnerLiability).toBe(10_000_000_000_000n)
  })

  it('direct vault mint uses the same allocation bucket', () => {
    const mint = new MintModel()
    mint.setBurner('vault', 'burner', 'mint', true)
    mint.mint('vault', 'burner', 'mint', 1n, 2n)
    expect(mint.mint('vault', 'vault', 'mint', 1n, 2n)).toBe('vault')
    expect(() => mint.mint('vault', 'vault', 'mint', 1n, 2n)).toThrow('AllocationExceeded')
  })
})

import fs from 'node:fs'
import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
const read = (p: string) => fs.readFileSync(p, 'utf8')
const sha = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const v1Hashes: Record<string, string> = {
  'contracts/RHBurnerPassRegistryV2.sol': 'e9ee0de7c5b72149a66e264ea29c846c1053bf8008e4ecaad616d19151baed9f',
  'contracts/RHBurnerPassFeeVaultV2.sol': 'a624c5f6e51101abcccf18569f7be605c3335ab85c49e60c5c95beed49b4f37f',
  'contracts/RHBurnerPassOfficialIntegrationRegistry.sol': '0d805c483bd11e57b3e5194eb6d2c6043f2b6d6f3b4cec7d7dbc85cbb62aaf32',
  'contracts/RHBurnerPassMintGate.sol': '7f6eac8175e0628e35a71b34fe6ffd98a5e27b7ac094c2f93419fe217c4c2984',
  'contracts/RHBurnerPassReferenceMint.sol': '31bac45e6d3e775bf764235482336df18a853529a973c5b19c60c500bd36a30d',
}
describe('v1 production source preservation', () => {
  for (const [file, expected] of Object.entries(v1Hashes)) it(`keeps ${file} byte-identical`, () => expect(sha(file)).toBe(expected))
})
describe('v2 protocol invariants', () => {
  const feeVault = read('contracts/RHBurnerPassFeeVaultV3.sol')
  const factory = read('contracts/RHBurnerPassFactoryV2.sol')
  const registry = read('contracts/RHBurnerPassRegistryV3.sol')
  const mint = read('contracts/RHBurnerPassMintTemplateV2.sol')
  it('fixes delegated fee and partner share', () => { expect(feeVault).toContain('FEE_PER_NFT = 0.00005 ether'); expect(feeVault).toContain('PARTNER_BPS = 1_000') })
  it('gets partner from canonical factory, not mint input', () => { expect(feeVault).toContain('factory.partnerOf(msg.sender)'); expect(feeVault).not.toContain('quantity, address partner') })
  it('separates protocol and partner accounting', () => { expect(feeVault).toContain('uint256 public protocolAccrued'); expect(feeVault).toContain('partnerAccrued'); expect(feeVault).toContain('uint256 amount = protocolAccrued') })
  it('has no arbitrary external registration function', () => { expect(factory).toContain('new RHBurnerPassMintTemplateV2'); expect(factory).not.toMatch(/function\s+registerIntegration\s*\(/) })
  it('allows new authorization only to factory mints', () => expect(registry).toContain('enabled && !factory.isOfficialMint(target)'))
  it('reuses vault-keyed MintGate and mints to caller', () => { expect(mint).toContain('RHBurnerPassMintGate'); expect(mint).toContain('_consumeVaultAllocation(vault, quantity, maxAllocation)'); expect(mint).toContain('_safeMint(msg.sender, nextTokenId++)') })
})

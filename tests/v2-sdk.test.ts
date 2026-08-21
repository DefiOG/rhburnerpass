import { describe, expect, it } from 'vitest'
import { buildAuthorizationUrl, mainnetConfig, RHBP_MAINNET } from '../packages/sdk/src/index'

const collection = '0xCA371B745edF27C090a7C5DA4e379a3b3e392284'
const burner = '0x42A6ED4FEfffc4D0f12312453e6E36d42A1Eb16B'

describe('RHBurnerPass collection SDK', () => {
  it('ships the canonical v2 mainnet bindings without changing the fee invariant', () => {
    const config = mainnetConfig()
    expect(config.chainId).toBe(4663)
    expect(config.factory.toLowerCase()).toBe('0x48bf0bfa8544acce021548b4d0a60b87a6358127')
    expect(config.registry.toLowerCase()).toBe('0x586a5e67439f2fa4ab51d511c8636788637b3b5f')
    expect(config.feeVault.toLowerCase()).toBe('0x2d86eeb6c2f8b5cdc29cdd0a4ad313109457d8f6')
    expect(RHBP_MAINNET.delegatedFeePerNftWei).toBe(50_000_000_000_000n)
  })

  it('builds a no-copy/paste authorization handoff URL', () => {
    const url = new URL(buildAuthorizationUrl({
      collection,
      burner,
      returnUrl: 'https://collection.example/mint?phase=allowlist',
    }))
    expect(url.origin + url.pathname).toBe('https://defiog.github.io/rhburnerpass/')
    expect(url.searchParams.get('collection')?.toLowerCase()).toBe(collection.toLowerCase())
    expect(url.searchParams.get('burner')?.toLowerCase()).toBe(burner.toLowerCase())
    expect(url.searchParams.get('return')).toBe('https://collection.example/mint?phase=allowlist')
  })

  it('rejects non-http return schemes', () => {
    expect(() => buildAuthorizationUrl({ collection, returnUrl: 'javascript:alert(1)' })).toThrow(/http or https/i)
  })
})

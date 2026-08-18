import { describe, expect, it, vi } from 'vitest'
import type { Address, WalletClient } from 'viem'
import {
  assertWriteSession,
  authorizationInputError,
  robinhoodChainTestnet,
  setBurner,
} from './rhburnerpass'

const vault = '0x1111111111111111111111111111111111111111' as Address
const burner = '0x2222222222222222222222222222222222222222' as Address
const target = '0x3333333333333333333333333333333333333333' as Address
const registry = '0x4444444444444444444444444444444444444444' as Address

describe('authorization input safety', () => {
  it('rejects a burner that is the vault', () => {
    expect(authorizationInputError(vault, vault.toUpperCase().replace('0X', '0x'), target))
      .toBe('The burner must be different from the vault.')
  })

  it('requires valid vault, burner, and target addresses', () => {
    expect(authorizationInputError('', burner, target)).toBe('Connect the vault wallet first.')
    expect(authorizationInputError(vault, 'not-an-address', target)).toBe('Enter a valid burner address.')
    expect(authorizationInputError(vault, burner, 'not-an-address')).toBe('Enter a valid compatible target mint address.')
    expect(authorizationInputError(vault, burner, target)).toBeNull()
  })
})

describe('wallet write session safety', () => {
  it('rejects an account that differs from the address under review', () => {
    expect(() => assertWriteSession(vault, burner, robinhoodChainTestnet.id))
      .toThrow('Wallet account changed')
  })

  it('rejects writes on another chain', () => {
    expect(() => assertWriteSession(vault, vault, 1)).toThrow(`Switch to ${robinhoodChainTestnet.name}`)
  })

  it('uses the reviewed address as the write sender', async () => {
    const writeContract = vi.fn().mockResolvedValue(`0x${'a'.repeat(64)}`)
    const client = {
      account: { address: vault },
      chain: { id: robinhoodChainTestnet.id },
      writeContract,
    } as unknown as WalletClient

    await setBurner(client, vault, registry, burner, target, true)

    expect(writeContract).toHaveBeenCalledOnce()
    expect(writeContract.mock.calls[0][0]).toMatchObject({
      account: vault,
      address: registry,
      functionName: 'setBurner',
      args: [burner, target, true],
    })
  })
})

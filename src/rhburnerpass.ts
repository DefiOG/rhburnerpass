import {
  createPublicClient,
  defineChain,
  http,
  isAddress,
  type Address,
  type Hex,
  type WalletClient,
} from 'viem'

const useTestnet = import.meta.env.VITE_RHBP_NETWORK === 'testnet'

export const robinhoodChain = defineChain({
  id: useTestnet ? 46630 : 4663,
  name: useTestnet ? 'Robinhood Chain Testnet' : 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [useTestnet ? 'https://rpc.testnet.chain.robinhood.com' : 'https://rpc.mainnet.chain.robinhood.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Robinhood Chain Explorer',
      url: useTestnet ? 'https://explorer.testnet.chain.robinhood.com' : 'https://robinhoodchain.blockscout.com',
    },
  },
})

export type RHBPConfig = {
  network: { chainId: number; name: string; rpcUrl: string; explorerUrl: string }
  contracts: {
    registry: string
    feeVault: string
    demoMint?: string
    officialIntegrationRegistry?: string
    factory?: string
  }
  feePerNftEth: string
  repoUrl?: string
  sampleMint?: string
  sampleVault?: string
  allowlistUrl?: string
}

export const registryAbi = [
  {
    type: 'function', name: 'setBurner', stateMutability: 'nonpayable',
    inputs: [
      { name: 'burner', type: 'address' },
      { name: 'target', type: 'address' },
      { name: 'enabled', type: 'bool' },
    ], outputs: [],
  },
  {
    type: 'function', name: 'isAuthorized', stateMutability: 'view',
    inputs: [
      { name: 'vault', type: 'address' },
      { name: 'burner', type: 'address' },
      { name: 'target', type: 'address' },
    ], outputs: [{ name: '', type: 'bool' }],
  },
] as const

export const officialIntegrationRegistryAbi = [
  {
    type: 'function', name: 'isOfficialIntegration', stateMutability: 'view',
    inputs: [{ name: 'target', type: 'address' }], outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function', name: 'canonicalRegistry', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function', name: 'canonicalFeeVault', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }],
  },
] as const

export const factoryAbi = [
  {
    type: 'function', name: 'isOfficialMint', stateMutability: 'view',
    inputs: [{ name: 'mint', type: 'address' }], outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function', name: 'partnerOf', stateMutability: 'view',
    inputs: [{ name: 'mint', type: 'address' }], outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function', name: 'registry', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function', name: 'feeVault', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }],
  },
] as const

export const mintGateIntegrationAbi = [
  {
    type: 'function', name: 'rhBurnerPassRegistry', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function', name: 'rhBurnerPassFeeVault', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }],
  },
] as const

export const protectedMintAbi = [
  {
    type: 'function', name: 'mint', stateMutability: 'payable',
    inputs: [
      { name: 'vault', type: 'address' },
      { name: 'maxAllocation', type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
      { name: 'proof', type: 'bytes32[]' },
    ], outputs: [],
  },
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'mintPrice', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'maxSupply', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'totalMinted', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'function', name: 'rhBurnerPassFee', stateMutability: 'view',
    inputs: [
      { name: 'caller', type: 'address' },
      { name: 'vault', type: 'address' },
      { name: 'quantity', type: 'uint256' },
    ], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'claimedByVault', stateMutability: 'view',
    inputs: [{ name: 'vault', type: 'address' }], outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export const demoMintAbi = protectedMintAbi

export const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(robinhoodChain.rpcUrls.default.http[0]),
})

export async function loadConfig(): Promise<RHBPConfig> {
  const configUrl = import.meta.env.VITE_RHBP_CONFIG_URL?.trim() || './config.json'
  const response = await fetch(configUrl, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Could not load ${configUrl}`)
  const config = await response.json() as RHBPConfig
  if (config.network.chainId !== robinhoodChain.id) {
    throw new Error(`Frontend network (${robinhoodChain.id}) does not match config chain (${config.network.chainId}).`)
  }
  return config
}

export function requireAddress(value: string, label: string): Address {
  if (!isAddress(value)) throw new Error(`${label} must be a valid EVM address.`)
  return value as Address
}

export function authorizationInputError(vault: string, burner: string, target: string): string | null {
  if (!isAddress(vault)) return 'Connect the vault wallet first.'
  if (!isAddress(burner)) return 'Enter a valid burner address.'
  if (vault.toLowerCase() === burner.toLowerCase()) return 'The burner must be different from the vault.'
  if (!isAddress(target)) return 'Enter a valid compatible target mint address.'
  return null
}

export function assertWriteSession(
  displayedAccount: Address,
  walletAccount: Address | undefined,
  chainId: number | undefined,
) {
  if (!walletAccount || walletAccount.toLowerCase() !== displayedAccount.toLowerCase()) {
    throw new Error('Wallet account changed. Review the current address and try again.')
  }
  if (chainId !== robinhoodChain.id) {
    throw new Error(`Switch to ${robinhoodChain.name} before submitting.`)
  }
}

export async function setBurner(
  client: WalletClient,
  displayedAccount: Address,
  registry: string,
  burner: Address,
  target: Address,
  enabled: boolean,
) {
  assertWriteSession(displayedAccount, client.account?.address, client.chain?.id)
  return client.writeContract({
    account: displayedAccount,
    chain: robinhoodChain,
    address: requireAddress(registry, 'Registry'),
    abi: registryAbi,
    functionName: 'setBurner',
    args: [burner, target, enabled],
  })
}

export async function isAuthorized(registry: string, vault: Address, burner: Address, target: Address) {
  return publicClient.readContract({
    address: requireAddress(registry, 'Registry'), abi: registryAbi,
    functionName: 'isAuthorized', args: [vault, burner, target],
  })
}

export async function assertCompatibleTarget(target: Address, registry: string, feeVault: string) {
  const expectedRegistry = requireAddress(registry, 'Registry')
  const expectedFeeVault = requireAddress(feeVault, 'Fee vault')
  const bytecode = await publicClient.getBytecode({ address: target })
  if (!bytecode || bytecode === '0x') throw new Error('Target mint has no deployed contract code.')

  try {
    const [targetRegistry, targetFeeVault] = await Promise.all([
      publicClient.readContract({ address: target, abi: mintGateIntegrationAbi, functionName: 'rhBurnerPassRegistry' }),
      publicClient.readContract({ address: target, abi: mintGateIntegrationAbi, functionName: 'rhBurnerPassFeeVault' }),
    ])
    if (targetRegistry.toLowerCase() !== expectedRegistry.toLowerCase()) {
      throw new Error('Target mint is not wired to the canonical RHBurnerPass registry.')
    }
    if (targetFeeVault.toLowerCase() !== expectedFeeVault.toLowerCase()) {
      throw new Error('Target mint is not wired to the canonical RHBurnerPass fee vault.')
    }
  } catch (caught: unknown) {
    if (caught instanceof Error && caught.message.startsWith('Target mint is not wired')) throw caught
    throw new Error('Target mint does not expose the required RHBurnerPass integration getters.')
  }
}

export async function assertOfficialTarget(
  target: Address,
  registry: string,
  feeVault: string,
  officialIntegrationRegistry: string,
) {
  const expectedRegistry = requireAddress(registry, 'Registry')
  const expectedFeeVault = requireAddress(feeVault, 'Fee vault')
  const officialRegistry = requireAddress(officialIntegrationRegistry, 'Official integration registry')

  const [boundRegistry, boundFeeVault, official] = await Promise.all([
    publicClient.readContract({ address: officialRegistry, abi: officialIntegrationRegistryAbi, functionName: 'canonicalRegistry' }),
    publicClient.readContract({ address: officialRegistry, abi: officialIntegrationRegistryAbi, functionName: 'canonicalFeeVault' }),
    publicClient.readContract({ address: officialRegistry, abi: officialIntegrationRegistryAbi, functionName: 'isOfficialIntegration', args: [target] }),
  ])

  if (boundRegistry.toLowerCase() !== expectedRegistry.toLowerCase()) throw new Error('Official integration registry is bound to a different RHBurnerPass Registry.')
  if (boundFeeVault.toLowerCase() !== expectedFeeVault.toLowerCase()) throw new Error('Official integration registry is bound to a different RHBurnerPass FeeVault.')
  if (!official) throw new Error('Target is not an approved official RHBurnerPass integration.')
  await assertCompatibleTarget(target, expectedRegistry, expectedFeeVault)
}

export async function assertFactoryTarget(target: Address, factory: string, registry: string, feeVault: string) {
  const factoryAddress = requireAddress(factory, 'Factory')
  const [official, factoryRegistry, factoryFeeVault] = await Promise.all([
    publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: 'isOfficialMint', args: [target] }),
    publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: 'registry' }),
    publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: 'feeVault' }),
  ])
  if (!official) throw new Error('Target is not a canonical RHBurnerPass Factory mint.')
  if (factoryRegistry.toLowerCase() !== requireAddress(registry, 'Registry').toLowerCase()) throw new Error('Factory is bound to a different Registry.')
  if (factoryFeeVault.toLowerCase() !== requireAddress(feeVault, 'Fee vault').toLowerCase()) throw new Error('Factory is bound to a different FeeVault.')
  await assertCompatibleTarget(target, registry, feeVault)
}

export function parseProof(raw: string): Hex[] {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('Proof must be a JSON array.')
  for (const item of parsed) {
    if (typeof item !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(item)) throw new Error('Every proof item must be a 32-byte 0x hex string.')
  }
  return parsed as Hex[]
}

export async function quoteProtectedMint(mint: string, caller: Address, vault: Address, quantity: bigint) {
  const address = requireAddress(mint, 'Mint')
  const [mintPrice, protocolFee] = await Promise.all([
    publicClient.readContract({ address, abi: protectedMintAbi, functionName: 'mintPrice' }),
    publicClient.readContract({ address, abi: protectedMintAbi, functionName: 'rhBurnerPassFee', args: [caller, vault, quantity] }),
  ])
  return { mintPrice, protocolFee, total: mintPrice * quantity + protocolFee }
}

export async function mintProtected(
  client: WalletClient,
  displayedAccount: Address,
  mint: string,
  vault: Address,
  maxAllocation: bigint,
  quantity: bigint,
  proof: Hex[],
) {
  assertWriteSession(displayedAccount, client.account?.address, client.chain?.id)
  const address = requireAddress(mint, 'Mint')
  const quote = await quoteProtectedMint(mint, displayedAccount, vault, quantity)
  const hash = await client.writeContract({
    account: displayedAccount,
    chain: robinhoodChain,
    address,
    abi: protectedMintAbi,
    functionName: 'mint',
    args: [vault, maxAllocation, quantity, proof],
    value: quote.total,
  })
  return { hash, quote }
}

export async function claimedByVault(mint: string, vault: Address) {
  return publicClient.readContract({
    address: requireAddress(mint, 'Mint'), abi: protectedMintAbi,
    functionName: 'claimedByVault', args: [vault],
  })
}

export async function readMintSummary(mint: string) {
  const address = requireAddress(mint, 'Mint')
  const [name, symbol, mintPrice, maxSupply, totalMinted] = await Promise.all([
    publicClient.readContract({ address, abi: protectedMintAbi, functionName: 'name' }),
    publicClient.readContract({ address, abi: protectedMintAbi, functionName: 'symbol' }),
    publicClient.readContract({ address, abi: protectedMintAbi, functionName: 'mintPrice' }),
    publicClient.readContract({ address, abi: protectedMintAbi, functionName: 'maxSupply' }),
    publicClient.readContract({ address, abi: protectedMintAbi, functionName: 'totalMinted' }),
  ])
  return { name, symbol, mintPrice, maxSupply, totalMinted }
}

export const quoteDemoMint = quoteProtectedMint
export const mintDemo = mintProtected

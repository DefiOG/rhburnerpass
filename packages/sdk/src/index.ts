import {
  createPublicClient,
  defineChain,
  http,
  isAddress,
  type Address,
  type Hex,
  type Chain,
  type PublicClient,
} from 'viem'
import { factoryAbi, mintAbi, registryAbi } from './abis.js'

export { factoryAbi, mintAbi, registryAbi } from './abis.js'

export const RHBP_MAINNET = {
  chainId: 4663,
  chainName: 'Robinhood Chain',
  rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
  explorerUrl: 'https://robinhoodchain.blockscout.com',
  portalUrl: 'https://defiog.github.io/rhburnerpass/',
  factory: '0x48bf0bfa8544acce021548b4d0a60b87a6358127',
  registry: '0x586a5e67439f2fa4ab51d511c8636788637b3b5f',
  feeVault: '0x2d86eeb6c2f8b5cdc29cdd0a4ad313109457d8f6',
  delegatedFeePerNftWei: 50_000_000_000_000n,
} as const

export type RHBurnerPassConfig = {
  chainId: number
  chainName?: string
  rpcUrl: string
  explorerUrl?: string
  portalUrl?: string
  factory: Address
  registry: Address
  feeVault: Address
}

export type ProtectedMintQuote = {
  mintPricePerNft: bigint
  mintSubtotal: bigint
  delegatedFee: bigint
  total: bigint
}

export type ProtectedMintPreparation = {
  address: Address
  abi: typeof mintAbi
  functionName: 'mint'
  args: readonly [Address, bigint, bigint, readonly Hex[]]
  value: bigint
  quote: ProtectedMintQuote
}

export type MintSummary = {
  name: string
  symbol: string
  mintPrice: bigint
  maxSupply: bigint
  totalMinted: bigint
}

export type CanonicalCollectionResult = {
  canonical: boolean
  reason?: string
}

export type ProtectedMintRequest = {
  collection: Address | string
  burner: Address | string
  vault: Address | string
  maxAllocation: bigint
  quantity: bigint
  proof: readonly Hex[]
  requireCanonical?: boolean
}

export type RHBurnerPassClient = {
  config: RHBurnerPassConfig
  chain: Chain
  publicClient: PublicClient
  isCanonicalCollection: (collection: Address | string) => Promise<CanonicalCollectionResult>
  assertCanonicalCollection: (collection: Address | string) => Promise<true>
  getAuthorization: (vault: Address | string, burner: Address | string, collection: Address | string) => Promise<boolean>
  getDelegatedFee: (collection: Address | string, burner: Address | string, vault: Address | string, quantity: bigint) => Promise<bigint>
  getClaimedByVault: (collection: Address | string, vault: Address | string) => Promise<bigint>
  getRemainingAllocation: (collection: Address | string, vault: Address | string, maxAllocation: bigint) => Promise<bigint>
  getMintSummary: (collection: Address | string) => Promise<MintSummary>
  quoteProtectedMint: (collection: Address | string, burner: Address | string, vault: Address | string, quantity: bigint) => Promise<ProtectedMintQuote>
  prepareProtectedMint: (request: ProtectedMintRequest) => Promise<ProtectedMintPreparation>
}

function asAddress(value: string, label: string): Address {
  if (!isAddress(value)) throw new Error(`${label} must be a valid EVM address.`)
  return value as Address
}

export function mainnetConfig(overrides: Partial<RHBurnerPassConfig> = {}): RHBurnerPassConfig {
  return {
    chainId: RHBP_MAINNET.chainId,
    chainName: RHBP_MAINNET.chainName,
    rpcUrl: RHBP_MAINNET.rpcUrl,
    explorerUrl: RHBP_MAINNET.explorerUrl,
    portalUrl: RHBP_MAINNET.portalUrl,
    factory: RHBP_MAINNET.factory,
    registry: RHBP_MAINNET.registry,
    feeVault: RHBP_MAINNET.feeVault,
    ...overrides,
  }
}

export function buildAuthorizationUrl({
  collection,
  burner,
  returnUrl,
  portalUrl = RHBP_MAINNET.portalUrl,
}: {
  collection: Address | string
  burner?: Address | string
  returnUrl?: string
  portalUrl?: string
}) {
  const collectionAddress = asAddress(collection, 'Collection')
  const url = new URL(portalUrl)
  url.searchParams.set('collection', collectionAddress)
  if (burner) url.searchParams.set('burner', asAddress(burner, 'Mint Wallet'))
  if (returnUrl) {
    const destination = new URL(returnUrl)
    if (!['https:', 'http:'].includes(destination.protocol)) throw new Error('Return URL must use http or https.')
    url.searchParams.set('return', destination.toString())
  }
  return url.toString()
}

export function createRHBurnerPassClient(
  input: RHBurnerPassConfig = mainnetConfig(),
  suppliedPublicClient?: PublicClient,
): RHBurnerPassClient {
  const config = {
    ...input,
    factory: asAddress(input.factory, 'Factory'),
    registry: asAddress(input.registry, 'Registry'),
    feeVault: asAddress(input.feeVault, 'FeeVault'),
  }

  const chain = defineChain({
    id: config.chainId,
    name: config.chainName ?? `Chain ${config.chainId}`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  })

  const publicClient = suppliedPublicClient ?? createPublicClient({ chain, transport: http(config.rpcUrl) })

  async function assertExpectedChain() {
    const liveChainId = await publicClient.getChainId()
    if (liveChainId !== config.chainId) {
      throw new Error(`RPC chain mismatch; expected ${config.chainId}, got ${liveChainId}.`)
    }
  }

  async function isCanonicalCollection(collection: Address | string): Promise<CanonicalCollectionResult> {
    const mint = asAddress(collection, 'Collection')
    await assertExpectedChain()
    const code = await publicClient.getCode({ address: mint })
    if (!code || code === '0x') return { canonical: false, reason: 'Collection has no deployed contract code.' }

    try {
      const [official, factoryRegistry, factoryFeeVault, mintRegistry, mintFeeVault] = await Promise.all([
        publicClient.readContract({ address: config.factory, abi: factoryAbi, functionName: 'isOfficialMint', args: [mint] }),
        publicClient.readContract({ address: config.factory, abi: factoryAbi, functionName: 'registry' }),
        publicClient.readContract({ address: config.factory, abi: factoryAbi, functionName: 'feeVault' }),
        publicClient.readContract({ address: mint, abi: mintAbi, functionName: 'rhBurnerPassRegistry' }),
        publicClient.readContract({ address: mint, abi: mintAbi, functionName: 'rhBurnerPassFeeVault' }),
      ])

      if (!official) return { canonical: false, reason: 'Collection is not registered by the canonical RHBurnerPass Factory.' }
      if (factoryRegistry.toLowerCase() !== config.registry.toLowerCase()) return { canonical: false, reason: 'Factory is bound to a different Registry.' }
      if (factoryFeeVault.toLowerCase() !== config.feeVault.toLowerCase()) return { canonical: false, reason: 'Factory is bound to a different FeeVault.' }
      if (mintRegistry.toLowerCase() !== config.registry.toLowerCase()) return { canonical: false, reason: 'Collection is bound to a different Registry.' }
      if (mintFeeVault.toLowerCase() !== config.feeVault.toLowerCase()) return { canonical: false, reason: 'Collection is bound to a different FeeVault.' }
      return { canonical: true }
    } catch (error) {
      return { canonical: false, reason: error instanceof Error ? error.message : 'Canonical collection validation failed.' }
    }
  }

  async function assertCanonicalCollection(collection: Address | string): Promise<true> {
    const result = await isCanonicalCollection(collection)
    if (!result.canonical) throw new Error(result.reason ?? 'Collection is not canonical.')
    return true
  }

  async function getAuthorization(vault: Address | string, burner: Address | string, collection: Address | string) {
    return publicClient.readContract({
      address: config.registry,
      abi: registryAbi,
      functionName: 'isAuthorized',
      args: [asAddress(vault, 'Safe Wallet'), asAddress(burner, 'Mint Wallet'), asAddress(collection, 'Collection')],
    })
  }

  async function getDelegatedFee(collection: Address | string, burner: Address | string, vault: Address | string, quantity: bigint) {
    if (quantity <= 0n) throw new Error('Quantity must be greater than zero.')
    return publicClient.readContract({
      address: asAddress(collection, 'Collection'),
      abi: mintAbi,
      functionName: 'rhBurnerPassFee',
      args: [asAddress(burner, 'Mint Wallet'), asAddress(vault, 'Safe Wallet'), quantity],
    })
  }

  async function getClaimedByVault(collection: Address | string, vault: Address | string) {
    return publicClient.readContract({
      address: asAddress(collection, 'Collection'),
      abi: mintAbi,
      functionName: 'claimedByVault',
      args: [asAddress(vault, 'Safe Wallet')],
    })
  }

  async function getRemainingAllocation(collection: Address | string, vault: Address | string, maxAllocation: bigint) {
    if (maxAllocation < 0n) throw new Error('maxAllocation cannot be negative.')
    const claimed = await getClaimedByVault(collection, vault)
    return maxAllocation > claimed ? maxAllocation - claimed : 0n
  }

  async function getMintSummary(collection: Address | string): Promise<MintSummary> {
    const mint = asAddress(collection, 'Collection')
    const [name, symbol, mintPrice, maxSupply, totalMinted] = await Promise.all([
      publicClient.readContract({ address: mint, abi: mintAbi, functionName: 'name' }),
      publicClient.readContract({ address: mint, abi: mintAbi, functionName: 'symbol' }),
      publicClient.readContract({ address: mint, abi: mintAbi, functionName: 'mintPrice' }),
      publicClient.readContract({ address: mint, abi: mintAbi, functionName: 'maxSupply' }),
      publicClient.readContract({ address: mint, abi: mintAbi, functionName: 'totalMinted' }),
    ])
    return { name, symbol, mintPrice, maxSupply, totalMinted }
  }

  async function quoteProtectedMint(collection: Address | string, burner: Address | string, vault: Address | string, quantity: bigint): Promise<ProtectedMintQuote> {
    if (quantity <= 0n) throw new Error('Quantity must be greater than zero.')
    const mint = asAddress(collection, 'Collection')
    const [mintPricePerNft, delegatedFee] = await Promise.all([
      publicClient.readContract({ address: mint, abi: mintAbi, functionName: 'mintPrice' }),
      getDelegatedFee(mint, burner, vault, quantity),
    ])
    const mintSubtotal = mintPricePerNft * quantity
    return { mintPricePerNft, mintSubtotal, delegatedFee, total: mintSubtotal + delegatedFee }
  }

  async function prepareProtectedMint({
    collection,
    burner,
    vault,
    maxAllocation,
    quantity,
    proof,
    requireCanonical = true,
  }: ProtectedMintRequest): Promise<ProtectedMintPreparation> {
    const mint = asAddress(collection, 'Collection')
    const burnerAddress = asAddress(burner, 'Mint Wallet')
    const vaultAddress = asAddress(vault, 'Safe Wallet')
    if (maxAllocation < 0n) throw new Error('maxAllocation cannot be negative.')
    if (quantity <= 0n) throw new Error('Quantity must be greater than zero.')
    if (requireCanonical) await assertCanonicalCollection(mint)
    const quote = await quoteProtectedMint(mint, burnerAddress, vaultAddress, quantity)
    return {
      address: mint,
      abi: mintAbi,
      functionName: 'mint',
      args: [vaultAddress, maxAllocation, quantity, proof],
      value: quote.total,
      quote,
    }
  }

  return {
    config,
    chain,
    publicClient,
    isCanonicalCollection,
    assertCanonicalCollection,
    getAuthorization,
    getDelegatedFee,
    getClaimedByVault,
    getRemainingAllocation,
    getMintSummary,
    quoteProtectedMint,
    prepareProtectedMint,
  }
}

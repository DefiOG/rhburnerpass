import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react'
import { formatEther, isAddress, type Address, type Hex } from 'viem'
import { useAccount, useWalletClient } from 'wagmi'
import {
  buildAuthorizationUrl,
  createRHBurnerPassClient,
  mainnetConfig,
  mintAbi,
  type RHBurnerPassClient,
  type RHBurnerPassConfig,
} from '@rhburnerpass/sdk'

export type RHBPProviderProps = PropsWithChildren<{
  config?: RHBurnerPassConfig
  portalUrl?: string
}>

type ContextValue = {
  client: RHBurnerPassClient
  portalUrl: string
}

const RHBPContext = createContext<ContextValue | null>(null)

export function RHBPProvider({ children, config = mainnetConfig(), portalUrl }: RHBPProviderProps) {
  const client = useMemo(() => createRHBurnerPassClient(config), [
    config.chainId,
    config.rpcUrl,
    config.factory,
    config.registry,
    config.feeVault,
  ])
  const value = useMemo(() => ({ client, portalUrl: portalUrl ?? config.portalUrl ?? mainnetConfig().portalUrl! }), [client, config.portalUrl, portalUrl])
  return <RHBPContext.Provider value={value}>{children}</RHBPContext.Provider>
}

export function useRHBP() {
  const value = useContext(RHBPContext)
  if (!value) throw new Error('Wrap your protected-mint UI in <RHBPProvider>.')
  return value
}

export type ProtectedMintState = {
  loading: boolean
  canonical: boolean | null
  authorized: boolean | null
  claimed: bigint | null
  remaining: bigint | null
  error: string | null
}

export function useProtectedMintStatus({
  collection,
  vault,
  burner,
  maxAllocation,
}: {
  collection: string
  vault: string
  burner?: string
  maxAllocation: bigint
}): ProtectedMintState {
  const { client } = useRHBP()
  const account = useAccount()
  const mintWallet = burner || account.address || ''
  const [state, setState] = useState<ProtectedMintState>({ loading: false, canonical: null, authorized: null, claimed: null, remaining: null, error: null })

  useEffect(() => {
    if (!isAddress(collection) || !isAddress(vault) || !isAddress(mintWallet)) {
      setState({ loading: false, canonical: null, authorized: null, claimed: null, remaining: null, error: null })
      return
    }
    let alive = true
    setState((previous) => ({ ...previous, loading: true, error: null }))
    ;(async () => {
      try {
        const canonicalResult = await client.isCanonicalCollection(collection)
        if (!canonicalResult.canonical) throw new Error(canonicalResult.reason ?? 'Collection is not canonical.')
        const [authorized, claimed] = await Promise.all([
          client.getAuthorization(vault, mintWallet, collection),
          client.getClaimedByVault(collection, vault),
        ])
        if (!alive) return
        setState({
          loading: false,
          canonical: true,
          authorized,
          claimed,
          remaining: maxAllocation > claimed ? maxAllocation - claimed : 0n,
          error: null,
        })
      } catch (error) {
        if (!alive) return
        setState({ loading: false, canonical: false, authorized: false, claimed: null, remaining: null, error: error instanceof Error ? error.message : 'Protected mint status failed.' })
      }
    })()
    return () => { alive = false }
  }, [client, collection, maxAllocation, mintWallet, vault])

  return state
}

export function ProtectedMintStatus({
  collection,
  vault,
  maxAllocation,
  burner,
}: {
  collection: string
  vault: string
  maxAllocation: bigint
  burner?: string
}) {
  const state = useProtectedMintStatus({ collection, vault, maxAllocation, burner })
  if (state.loading) return <span data-rhbp-status="loading">Checking protected mint…</span>
  if (state.error) return <span data-rhbp-status="error">{state.error}</span>
  if (state.authorized === null) return <span data-rhbp-status="idle">Connect your Mint Wallet.</span>
  if (!state.authorized) return <span data-rhbp-status="needs-permission">Safe Wallet permission required.</span>
  return <span data-rhbp-status="ready">Protected mint ready · {state.remaining?.toString() ?? '0'} remaining</span>
}

export type ProtectedMintButtonProps = {
  collection: Address | string
  vault: Address | string
  maxAllocation: bigint
  proof: readonly Hex[]
  quantity?: bigint
  returnUrl?: string
  children?: ReactNode
  onSubmitted?: (hash: Hex) => void
  onConfirmed?: (hash: Hex) => void
  onError?: (error: Error) => void
  buttonProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'>
}

export function ProtectedMintButton({
  collection,
  vault,
  maxAllocation,
  proof,
  quantity = 1n,
  returnUrl,
  children,
  onSubmitted,
  onConfirmed,
  onError,
  buttonProps,
}: ProtectedMintButtonProps) {
  const { client, portalUrl } = useRHBP()
  const { address, chainId, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const state = useProtectedMintStatus({ collection: String(collection), vault: String(vault), maxAllocation })
  const [busy, setBusy] = useState(false)
  const [quote, setQuote] = useState<bigint | null>(null)

  useEffect(() => {
    if (!address || !state.authorized || !isAddress(String(collection)) || !isAddress(String(vault))) {
      setQuote(null)
      return
    }
    let alive = true
    client.quoteProtectedMint(collection, address, vault, quantity)
      .then((next) => { if (alive) setQuote(next.total) })
      .catch(() => { if (alive) setQuote(null) })
    return () => { alive = false }
  }, [address, client, collection, quantity, state.authorized, vault])

  async function handleClick() {
    try {
      if (!address || !isConnected) throw new Error('Connect the Mint Wallet first.')
      if (!isAddress(String(collection))) throw new Error('Collection address is invalid.')
      if (!isAddress(String(vault))) throw new Error('Safe Wallet address is invalid.')

      if (!state.authorized) {
        const destination = buildAuthorizationUrl({
          collection,
          burner: address,
          returnUrl: returnUrl ?? window.location.href,
          portalUrl,
        })
        window.location.assign(destination)
        return
      }

      if (!walletClient?.account) throw new Error('Wallet is still initializing.')
      if (chainId !== client.config.chainId) throw new Error(`Switch to chain ${client.config.chainId} before minting.`)
      if (walletClient.account.address.toLowerCase() !== address.toLowerCase()) throw new Error('Connected wallet changed. Review the Mint Wallet and try again.')
      if (state.remaining !== null && quantity > state.remaining) throw new Error('Quantity exceeds the Safe Wallet remaining allocation.')

      setBusy(true)
      const prepared = await client.prepareProtectedMint({ collection, burner: address, vault, maxAllocation, quantity, proof })
      const hash = await walletClient.writeContract({
        account: address,
        chain: client.chain,
        address: prepared.address,
        abi: mintAbi,
        functionName: 'mint',
        args: prepared.args,
        value: prepared.value,
      })
      onSubmitted?.(hash)
      const receipt = await client.publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Protected mint reverted on-chain.')
      onConfirmed?.(hash)
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error('Protected mint failed.')
      onError?.(normalized)
      if (!onError) console.error(normalized)
    } finally {
      setBusy(false)
    }
  }

  let label: ReactNode = children
  if (!label) {
    if (busy) label = 'Minting…'
    else if (!isConnected) label = 'Connect Mint Wallet'
    else if (state.loading) label = 'Checking protection…'
    else if (!state.authorized) label = 'Enable Protected Mint'
    else label = quote === null ? 'Mint safely' : `Mint safely · ${formatEther(quote)} ETH`
  }

  return (
    <button {...buttonProps} type={buttonProps?.type ?? 'button'} onClick={handleClick} disabled={buttonProps?.disabled || busy || state.loading} data-rhbp-protected-mint>
      {label}
    </button>
  )
}

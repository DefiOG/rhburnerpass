import { useEffect, useMemo, useState } from 'react'
import { formatEther, isAddress, type Address, type Hex } from 'viem'
import { useAccount, useWalletClient } from 'wagmi'
import { useAppConfig } from './hooks'
import {
  assertFactoryTarget,
  claimedByVault,
  isAuthorized,
  mintProtected,
  quoteProtectedMint,
  readMintSummary,
  robinhoodChain,
} from './rhburnerpass'
import { WalletControl } from './WalletControl'

type AllowlistEntry = { address: string; maxAllocation: string | number; proof: Hex[] }
type AllowlistFile = { root?: string; entries: AllowlistEntry[] }
type MintSummary = Awaited<ReturnType<typeof readMintSummary>>

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function MintPage() {
  const { config, error: configError } = useAppConfig()
  const { address, chainId, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [mint, setMint] = useState('')
  const [vault, setVault] = useState('')
  const [expectedBurner, setExpectedBurner] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [allowlist, setAllowlist] = useState<AllowlistFile | null>(null)
  const [summary, setSummary] = useState<MintSummary | null>(null)
  const [claimed, setClaimed] = useState<bigint | null>(null)
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [quote, setQuote] = useState<{ mintPrice: bigint; protocolFee: bigint; total: bigint } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Connect the authorized burner wallet to continue.')
  const [hash, setHash] = useState<Hex | null>(null)

  useEffect(() => {
    if (!config) return
    const savedMint = sessionStorage.getItem('rhbp:mint') ?? ''
    const savedVault = sessionStorage.getItem('rhbp:vault') ?? ''
    const savedBurner = sessionStorage.getItem('rhbp:burner') ?? ''
    if (!mint) setMint(savedMint || config.sampleMint || '')
    if (!vault) setVault(savedVault || config.sampleVault || '')
    if (!expectedBurner) setExpectedBurner(savedBurner)
    if (config.allowlistUrl) {
      fetch(config.allowlistUrl, { cache: 'no-store' })
        .then((res) => {
          if (!res.ok) throw new Error('Could not load this collection’s allowlist data.')
          return res.json()
        })
        .then((data: AllowlistFile) => setAllowlist(data))
        .catch((err: Error) => setMessage(err.message))
    }
  }, [config, expectedBurner, mint, vault])

  const entry = useMemo(() => {
    if (!allowlist || !isAddress(vault)) return null
    return allowlist.entries.find((item) => item.address.toLowerCase() === vault.toLowerCase()) ?? null
  }, [allowlist, vault])

  const maxAllocation = entry ? BigInt(entry.maxAllocation) : 0n
  const remaining = claimed === null ? null : maxAllocation > claimed ? maxAllocation - claimed : 0n
  const wrongNetwork = isConnected && chainId !== robinhoodChain.id
  const wrongBurner = Boolean(address && expectedBurner && address.toLowerCase() !== expectedBurner.toLowerCase())
  const canLoad = Boolean(config?.contracts.factory && isAddress(mint) && isAddress(vault) && address && entry && !wrongNetwork)

  useEffect(() => {
    if (!canLoad || !config || !address || !entry) {
      setSummary(null)
      setClaimed(null)
      setAuthorized(null)
      setQuote(null)
      return
    }
    let alive = true
    ;(async () => {
      try {
        await assertFactoryTarget(mint as Address, config.contracts.factory!, config.contracts.registry, config.contracts.feeVault)
        const [mintSummary, used, auth, nextQuote] = await Promise.all([
          readMintSummary(mint),
          claimedByVault(mint, vault as Address),
          isAuthorized(config.contracts.registry, vault as Address, address, mint as Address),
          quoteProtectedMint(mint, address, vault as Address, BigInt(quantity)),
        ])
        if (!alive) return
        setSummary(mintSummary)
        setClaimed(used)
        setAuthorized(auth)
        setQuote(nextQuote)
        if (wrongBurner) {
          setMessage(`This browser session was authorized for ${short(expectedBurner)}. Switch to that burner wallet.`)
        } else {
          setMessage(auth ? 'Authorization confirmed. Choose a quantity and mint.' : 'This connected wallet is not authorized for this vault and mint.')
        }
      } catch (err) {
        if (alive) setMessage(err instanceof Error ? err.message : 'Could not load mint.')
      }
    })()
    return () => { alive = false }
  }, [address, canLoad, config, entry, expectedBurner, mint, quantity, vault, wrongBurner])

  useEffect(() => {
    if (remaining !== null && remaining > 0n && BigInt(quantity) > remaining) setQuantity(Number(remaining))
  }, [quantity, remaining])

  async function submitMint() {
    if (!walletClient || !address || !config || !entry || !authorized || !summary || remaining === null || wrongBurner) return
    if (quantity < 1 || BigInt(quantity) > remaining) {
      setMessage(`Choose between 1 and ${remaining.toString()} remaining mint(s).`)
      return
    }
    try {
      setBusy(true)
      setHash(null)
      setMessage('Confirm the mint in your burner wallet…')
      const result = await mintProtected(
        walletClient,
        address,
        mint,
        vault as Address,
        BigInt(entry.maxAllocation),
        BigInt(quantity),
        entry.proof,
      )
      setHash(result.hash)
      setMessage('Transaction submitted. Waiting for confirmation…')
      const receipt = await (await import('./rhburnerpass')).publicClient.waitForTransactionReceipt({ hash: result.hash })
      if (receipt.status !== 'success') throw new Error('Mint transaction reverted.')
      const used = await claimedByVault(mint, vault as Address)
      setClaimed(used)
      setMessage(`Mint confirmed. ${used.toString()} of ${entry.maxAllocation} vault allocation used.`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Mint failed.')
    } finally {
      setBusy(false)
    }
  }

  const explorer = config?.network.explorerUrl ?? robinhoodChain.blockExplorers.default.url
  const maxQty = remaining === null ? 1 : Math.max(1, Number(remaining))
  const mintDisabled = !authorized || !entry || !walletClient || busy || remaining === 0n || wrongBurner

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#/"><span className="flame">🔥</span> RHBurnerPass</a>
        <div className="nav-actions">
          <a className="developer-nav-link" href="#/">Vault authorization</a>
          <span className="network-dot live">{robinhoodChain.id === 46630 ? 'Testnet' : 'Mainnet'}</span>
          <WalletControl role="burner" />
        </div>
      </nav>

      <section className="hero portal-hero compact-hero">
        <span className="pill">Burner mint</span>
        <h1>Vault eligibility. <span>Burner execution.</span></h1>
        <p>Your vault stays disconnected. The authorized burner sends this transaction and receives the NFT.</p>
      </section>

      <section className="workflow-layout">
        <aside className="flow-steps">
          <div className={address ? 'complete' : 'active'}><span>1</span><p><strong>Connect burner</strong><small>Use the low-value wallet you authorized.</small></p></div>
          <div className={entry ? 'complete' : address ? 'active' : ''}><span>2</span><p><strong>Load eligibility</strong><small>The allowlist remains keyed to the vault.</small></p></div>
          <div className={authorized ? 'complete' : entry ? 'active' : ''}><span>3</span><p><strong>Confirm authorization</strong><small>Must match this exact mint contract.</small></p></div>
          <div className={authorized && remaining !== 0n ? 'active' : ''}><span>4</span><p><strong>Mint</strong><small>NFT is delivered to the burner.</small></p></div>
        </aside>

        <article className="card authorization-card">
          <div className="card-heading">
            <div><span className="eyebrow">CANONICAL RHBP MINT</span><h2>{summary ? `${summary.name} (${summary.symbol})` : 'Protected mint'}</h2></div>
            <span className="scope-badge">Vault-safe flow</span>
          </div>

          {configError && <div className="inline-alert error">{configError}</div>}
          {wrongNetwork && <div className="inline-alert warning-box">Switch to {robinhoodChain.name} before continuing.</div>}
          {wrongBurner && <div className="inline-alert warning-box">Wrong wallet connected. Switch to the burner authorized in the vault portal: <strong>{short(expectedBurner)}</strong>.</div>}

          <div className="identity-row">
            <span>Connected burner</span>
            <strong>{address ? short(address) : 'Not connected'}</strong>
            {address && <code>{address}</code>}
          </div>

          <div className="two-col compact-fields">
            <label>Mint contract<input value={mint} onChange={(e) => setMint(e.target.value.trim())} placeholder="0x…" spellCheck={false} /></label>
            <label>Eligible vault<input value={vault} onChange={(e) => setVault(e.target.value.trim())} placeholder="0x…" spellCheck={false} /></label>
          </div>

          <div className="mint-stats">
            <div><span>Allocation</span><strong>{entry ? entry.maxAllocation : '—'}</strong></div>
            <div><span>Claimed</span><strong>{claimed === null ? '—' : claimed.toString()}</strong></div>
            <div><span>Remaining</span><strong>{remaining === null ? '—' : remaining.toString()}</strong></div>
            <div><span>Authorization</span><strong className={authorized ? 'good-text' : ''}>{authorized === null ? '—' : authorized ? 'Ready' : 'Missing'}</strong></div>
          </div>

          <div className="quantity-row">
            <div><span className="field-title">Quantity</span><small>Cannot exceed the vault’s remaining allocation.</small></div>
            <div className="quantity-control">
              <button aria-label="Decrease quantity" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1}>−</button>
              <strong>{quantity}</strong>
              <button aria-label="Increase quantity" onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))} disabled={quantity >= maxQty}>+</button>
            </div>
          </div>

          {summary && quote && (
            <div className="quote mint-quote">
              <span>Collection price <strong>{formatEther(summary.mintPrice * BigInt(quantity))} ETH</strong></span>
              <span>RHBurnerPass fee <strong>{formatEther(quote.protocolFee)} ETH</strong></span>
              <span className="quote-total">Total <strong>{formatEther(quote.total)} ETH</strong></span>
              <small>RHBP fee is 0.00005 ETH per delegated NFT. 90% accrues to the protocol and 10% to this mint’s registered integration partner.</small>
              <span>Supply <strong>{summary.totalMinted.toString()} / {summary.maxSupply.toString()}</strong></span>
            </div>
          )}

          <div className="actions mint-actions">
            <button className="primary large-action" disabled={mintDisabled} onClick={submitMint}>{busy ? 'Minting…' : `Mint ${quantity} with burner`}</button>
            {!authorized && <a className="text-action" href="#/">Need authorization? Return to vault portal →</a>}
          </div>
          <div className={`status ${hash ? 'success' : authorized ? 'success' : 'idle'}`}>
            <span>{message}</span>
            {hash && <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}
          </div>
        </article>
      </section>
    </main>
  )
}

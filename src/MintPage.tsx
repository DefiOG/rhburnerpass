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
import { WalletMismatchNotice } from './onboarding'
import { readActivePermission } from './permission'

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
  const [message, setMessage] = useState('Connect your Mint Wallet to continue.')
  const [hash, setHash] = useState<Hex | null>(null)
  const [showTechnical, setShowTechnical] = useState(() => !readActivePermission())

  useEffect(() => {
    if (!config) return
    // The vault → burner → collection handoff is read automatically from the
    // saved Active Permission — the user never has to retype it here.
    const saved = readActivePermission()
    if (!mint) setMint(saved?.mint || config.sampleMint || '')
    if (!vault) setVault(saved?.vault || config.sampleVault || '')
    if (!expectedBurner) setExpectedBurner(saved?.burner ?? '')
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
          setMessage(`This browser session's permission is for ${short(expectedBurner)}. Switch to that Mint Wallet.`)
        } else {
          setMessage(auth ? 'Permission confirmed. Choose a quantity and mint.' : 'This connected wallet does not have permission for this Safe Wallet and collection.')
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
        <span className="pill">Mint Wallet mint</span>
        <h1>Safe Wallet eligibility. <span>Mint Wallet execution.</span></h1>
        <p>Your Safe Wallet stays disconnected. Your Mint Wallet sends this transaction and receives the NFT.</p>
      </section>

      <section className="workflow-layout">
        <aside className="flow-steps">
          <div className={address ? 'complete' : 'active'}><span>1</span><p><strong>Connect Mint Wallet</strong><small>Use the low-value wallet you gave permission to.</small></p></div>
          <div className={entry ? 'complete' : address ? 'active' : ''}><span>2</span><p><strong>Load eligibility</strong><small>The allowlist remains keyed to the Safe Wallet.</small></p></div>
          <div className={authorized ? 'complete' : entry ? 'active' : ''}><span>3</span><p><strong>Confirm permission</strong><small>Must match this exact collection.</small></p></div>
          <div className={authorized && remaining !== 0n ? 'active' : ''}><span>4</span><p><strong>Mint</strong><small>NFT is delivered to the Mint Wallet.</small></p></div>
        </aside>

        <article className="card authorization-card">
          <div className="card-heading">
            <div><span className="eyebrow">CANONICAL RHBP MINT</span><h2>{summary ? `${summary.name} (${summary.symbol})` : 'Protected mint'}</h2></div>
            <span className="scope-badge">Safe Wallet-safe flow</span>
          </div>

          {configError && <div className="inline-alert error">{configError}</div>}
          {wrongNetwork && <div className="inline-alert warning-box">Switch to {robinhoodChain.name} before continuing.</div>}
          {wrongBurner && <WalletMismatchNotice expected={expectedBurner} connected={address ?? ''} />}

          <div className="identity-row">
            <span>Connected Mint Wallet</span>
            <strong>{address ? short(address) : 'Not connected'}</strong>
            {address && <code>{address}</code>}
          </div>

          <div className="active-permission-summary">
            <span>Collection</span><strong>{summary ? `${summary.name} (${summary.symbol})` : short(mint || '0x')}</strong>
            <span>Safe Wallet</span><strong>{vault ? short(vault) : '—'}</strong>
          </div>

          <div className="mint-stats">
            <div><span>Allocation</span><strong>{entry ? entry.maxAllocation : '—'}</strong></div>
            <div><span>Claimed</span><strong>{claimed === null ? '—' : claimed.toString()}</strong></div>
            <div><span>Remaining</span><strong>{remaining === null ? '—' : remaining.toString()}</strong></div>
            <div><span>Permission</span><strong className={authorized ? 'good-text' : ''}>{authorized === null ? '—' : authorized ? 'Ready' : 'Missing'}</strong></div>
          </div>

          <div className="quantity-row">
            <div><span className="field-title">Quantity</span><small>Cannot exceed the Safe Wallet’s remaining allocation.</small></div>
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
            <button className="primary large-action" disabled={mintDisabled} onClick={submitMint}>{busy ? 'Minting…' : `Mint ${quantity} with Mint Wallet`}</button>
            {!authorized && <a className="text-action" href="#/">Need permission? Return to Safe Wallet portal →</a>}
          </div>
          <div className={`status ${hash ? 'success' : authorized ? 'success' : 'idle'}`}>
            <span>{message}</span>
            {hash && <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}
          </div>

          <button type="button" className="text-action inline-toggle" onClick={() => setShowTechnical((v) => !v)}>
            {showTechnical ? 'Hide technical details' : 'Show technical details'}
          </button>
          {showTechnical && (
            <div className="technical-details">
              <label>Mint contract<input value={mint} onChange={(e) => setMint(e.target.value.trim())} placeholder="0x…" spellCheck={false} /></label>
              <label>Eligible vault<input value={vault} onChange={(e) => setVault(e.target.value.trim())} placeholder="0x…" spellCheck={false} /></label>
            </div>
          )}
        </article>
      </section>
    </main>
  )
}

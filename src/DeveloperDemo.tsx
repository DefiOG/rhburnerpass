import { useEffect, useRef, useState } from 'react'
import { formatEther, isAddress, type Address, type Hex } from 'viem'
import { useAccount, useWalletClient } from 'wagmi'
import { useAppConfig } from './hooks'
import {
  claimedByVault,
  mintDemo,
  parseProof,
  publicClient,
  quoteDemoMint,
  robinhoodChainTestnet,
} from './rhburnerpass'
import { WalletControl } from './WalletControl'

type DemoStatus = { kind: 'idle' | 'pending' | 'success' | 'error'; message: string; hash?: Hex }

export function DeveloperDemo() {
  const { config, error: configError } = useAppConfig()
  const { address, chainId, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [vault, setVault] = useState('')
  const [allocation, setAllocation] = useState('1')
  const [quantity, setQuantity] = useState('1')
  const [proof, setProof] = useState('[]')
  const [quote, setQuote] = useState('')
  const [claimed, setClaimed] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<DemoStatus>({ kind: 'idle', message: 'Connect the burner wallet to use the reference mint.' })
  const sessionKey = `${address ?? ''}:${chainId ?? ''}`
  const operationKey = `${sessionKey}:${vault.toLowerCase()}:${allocation}:${quantity}:${proof}`
  const currentOperation = useRef(operationKey)
  currentOperation.current = operationKey

  useEffect(() => {
    setQuote('')
    setClaimed('')
    setBusy(false)
    setStatus({ kind: 'idle', message: 'Wallet session changed. Review the burner address before continuing.' })
  }, [sessionKey])

  useEffect(() => {
    setQuote('')
    setClaimed('')
    setBusy(false)
    setStatus({ kind: 'idle', message: 'Inputs changed. Review them before continuing.' })
  }, [vault, allocation, quantity, proof])

  const demoMintAddress = config?.contracts.demoMint ?? ''
  const wrongNetwork = isConnected && chainId !== robinhoodChainTestnet.id
  const validInputs = Boolean(address && isAddress(vault) && isAddress(demoMintAddress) && !wrongNetwork)
  const explorerBase = config?.network.explorerUrl ?? robinhoodChainTestnet.blockExplorers.default.url

  async function getQuote() {
    if (!address || !validInputs) return
    const submittedOperation = operationKey
    try {
      setBusy(true)
      const parsedQuantity = BigInt(quantity)
      if (parsedQuantity <= 0n) throw new Error('Quantity must be greater than zero.')
      const result = await quoteDemoMint(demoMintAddress, address, vault as Address, parsedQuantity)
      const used = await claimedByVault(demoMintAddress, vault as Address)
      if (currentOperation.current !== submittedOperation) return
      setQuote(`${formatEther(result.total)} ETH total (${formatEther(result.protocolFee)} ETH protocol fee)`)
      setClaimed(used.toString())
      setStatus({ kind: 'idle', message: 'Quote loaded from the demo mint contract.' })
    } catch (caught: unknown) {
      if (currentOperation.current === submittedOperation) {
        setStatus({ kind: 'error', message: caught instanceof Error ? caught.message : 'Could not quote the demo mint.' })
      }
    } finally {
      if (currentOperation.current === submittedOperation) setBusy(false)
    }
  }

  async function submitMint() {
    if (!address || !walletClient || !validInputs) return
    const submittedOperation = operationKey
    try {
      setBusy(true)
      const parsedAllocation = BigInt(allocation)
      const parsedQuantity = BigInt(quantity)
      if (parsedAllocation <= 0n || parsedQuantity <= 0n) throw new Error('Allocation and quantity must be greater than zero.')
      const parsedProof = parseProof(proof)
      setStatus({ kind: 'pending', message: 'Confirm the protected test mint in the burner wallet.' })
      const result = await mintDemo(
        walletClient,
        address,
        demoMintAddress,
        vault as Address,
        parsedAllocation,
        parsedQuantity,
        parsedProof,
      )
      if (currentOperation.current !== submittedOperation) return
      setStatus({ kind: 'pending', message: 'Mint submitted. Waiting for confirmation…', hash: result.hash })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: result.hash })
      if (receipt.status !== 'success') throw new Error('The mint transaction reverted on-chain.')
      const used = await claimedByVault(demoMintAddress, vault as Address)
      if (currentOperation.current !== submittedOperation) return
      setClaimed(used.toString())
      setStatus({ kind: 'success', message: 'Protected test mint confirmed.', hash: result.hash })
    } catch (caught: unknown) {
      if (currentOperation.current === submittedOperation) {
        setStatus({ kind: 'error', message: caught instanceof Error ? caught.message : 'Protected test mint failed.' })
      }
    } finally {
      if (currentOperation.current === submittedOperation) setBusy(false)
    }
  }

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#/"><span className="flame">🔥</span> RHBurnerPass</a>
        <div className="nav-actions"><WalletControl /></div>
      </nav>

      <section className="demo-header">
        <a className="back-link" href="#/">← Back to vault portal</a>
        <span className="pill demo-pill">Developer testnet demo</span>
        <h1>Reference protected mint</h1>
        <p>This test harness is for integration testing. It is not the normal RHBurnerPass user flow.</p>
      </section>

      <section className="demo-layout">
        <article className="card">
          <div className="card-heading">
            <div><span className="eyebrow">BURNER SIDE</span><h2>Test the mint gate</h2></div>
            <span className="scope-badge">Testnet only</span>
          </div>
          {configError && <div className="inline-alert error">{configError}</div>}
          {wrongNetwork && <div className="inline-alert warning-box">Switch to Robinhood Chain Testnet before minting.</div>}

          <div className="identity-row">
            <span>Connected burner</span>
            <strong>{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Not connected'}</strong>
            {address && <code>{address}</code>}
          </div>

          <label>Eligible vault<input placeholder="0x…" value={vault} onChange={(event) => setVault(event.target.value.trim())} disabled={busy} spellCheck={false} /></label>
          <div className="two-col">
            <label>Max allocation<input inputMode="numeric" value={allocation} onChange={(event) => setAllocation(event.target.value)} disabled={busy} /></label>
            <label>Quantity<input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={busy} /></label>
          </div>
          <label>Merkle proof (JSON array)<textarea value={proof} onChange={(event) => setProof(event.target.value)} disabled={busy} spellCheck={false} /></label>

          <div className="actions">
            <button onClick={getQuote} disabled={!validInputs || busy}>Get quote</button>
            <button className="primary" onClick={submitMint} disabled={!validInputs || busy}>{busy ? 'Working…' : 'Mint test NFT'}</button>
          </div>
          {!validInputs && <p className="disabled-reason">Connect a burner on Robinhood Chain Testnet and enter a valid vault address.</p>}
          {quote && <div className="quote"><strong>{quote}</strong>{claimed && <span>Vault allocation used: {claimed}</span>}</div>}
          <div className={`status ${status.kind}`} role="status">
            <span>{status.message}</span>
            {status.hash && <a href={`${explorerBase}/tx/${status.hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}
          </div>
        </article>

        <aside className="demo-context">
          <h2>What this proves</h2>
          <ul>
            <li>The connected burner is the transaction sender and NFT recipient.</li>
            <li>The Merkle proof resolves eligibility to the vault.</li>
            <li>The registry permits only the authorized vault, burner, and target tuple.</li>
            <li>Claimed allocation is recorded against the vault.</li>
          </ul>
          <div className="contract-detail"><span>Demo mint</span><code>{demoMintAddress || 'Loading…'}</code></div>
          <div className="contract-detail"><span>Registry</span><code>{config?.contracts.registry || 'Loading…'}</code></div>
        </aside>
      </section>

      <footer><div><strong>Developer testnet tooling</strong><p>Never use valuable wallets or mainnet funds.</p></div><a href="#/">Return to vault portal</a></footer>
    </main>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { isAddress, type Address, type Hex } from 'viem'
import { useAccount, useWalletClient } from 'wagmi'
import { useAppConfig } from './hooks'
import {
  authorizationInputError,
  assertOfficialTarget,
  isAuthorized,
  publicClient,
  robinhoodChainTestnet,
  setBurner,
} from './rhburnerpass'
import { WalletControl } from './WalletControl'

type ActionStatus = {
  kind: 'idle' | 'pending' | 'success' | 'error'
  message: string
  hash?: Hex
}

const idleStatus: ActionStatus = {
  kind: 'idle',
  message: 'Connect the vault wallet to create or revoke a scoped authorization.',
}

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function VaultPortal() {
  const { config, error: configError } = useAppConfig()
  const { address, chainId, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [burner, setBurnerAddress] = useState('')
  const [target, setTarget] = useState('')
  const [verified, setVerified] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<ActionStatus>(idleStatus)
  const sessionKey = `${address ?? ''}:${chainId ?? ''}`
  const operationKey = `${sessionKey}:${burner.toLowerCase()}:${target.toLowerCase()}`
  const currentOperation = useRef(operationKey)
  currentOperation.current = operationKey

  useEffect(() => {
    if (config?.contracts.demoMint && !target) setTarget(config.contracts.demoMint)
  }, [config, target])

  useEffect(() => {
    setVerified(null)
    setBusy(false)
    setStatus(idleStatus)
  }, [sessionKey])

  useEffect(() => {
    setVerified(null)
    setBusy(false)
    setStatus(idleStatus)
  }, [burner, target])

  const wrongNetwork = isConnected && chainId !== robinhoodChainTestnet.id
  const inputError = authorizationInputError(address ?? '', burner, target)
  const registryReady = Boolean(config && isAddress(config.contracts.registry))
  const officialRegistryReady = Boolean(config && isAddress(config.contracts.officialIntegrationRegistry ?? ''))
  const baseActionReason = !registryReady
    ? 'The registry configuration is unavailable.'
    : wrongNetwork
      ? `Switch to ${robinhoodChainTestnet.name}.`
      : address && !walletClient
        ? 'The wallet session is still initializing.'
      : inputError
  const authorizeReason = baseActionReason ?? (!officialRegistryReady
    ? 'Official integration registry is not configured yet. New authorizations are disabled; verification and revocation remain available.'
    : null)

  const reviewReady = !baseActionReason
  const explorerBase = config?.network.explorerUrl ?? robinhoodChainTestnet.blockExplorers.default.url

  async function submitAuthorization(enabled: boolean) {
    const blockingReason = enabled ? authorizeReason : baseActionReason
    if (!address || !walletClient || !config || blockingReason) return
    const submittedOperation = operationKey
    const burnerAddress = burner as Address
    const targetAddress = target as Address

    try {
      setBusy(true)
      setVerified(null)
      if (enabled) {
        setStatus({ kind: 'pending', message: 'Checking official integration approval, code hash, Registry, and FeeVault…' })
        await assertOfficialTarget(
          targetAddress,
          config.contracts.registry,
          config.contracts.feeVault,
          config.contracts.officialIntegrationRegistry ?? '',
        )
        if (currentOperation.current !== submittedOperation) return
      }

      setStatus({ kind: 'pending', message: `Confirm ${enabled ? 'authorization' : 'revocation'} in your vault wallet.` })

      const hash = await setBurner(
        walletClient,
        address,
        config.contracts.registry,
        burnerAddress,
        targetAddress,
        enabled,
      )

      if (currentOperation.current !== submittedOperation) return
      setStatus({ kind: 'pending', message: 'Transaction submitted. Waiting for confirmation…', hash })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('The transaction reverted on-chain.')

      const authorized = await isAuthorized(
        config.contracts.registry,
        address,
        burnerAddress,
        targetAddress,
      )
      if (currentOperation.current !== submittedOperation) return

      setVerified(authorized)
      if (authorized !== enabled) throw new Error('Transaction confirmed, but the registry state did not match the requested change.')
      setStatus({
        kind: 'success',
        message: enabled
          ? 'Burner authorized for this target only. You can now disconnect the vault.'
          : 'Scoped burner authorization revoked.',
        hash,
      })
    } catch (caught: unknown) {
      if (currentOperation.current !== submittedOperation) return
      setStatus({ kind: 'error', message: caught instanceof Error ? caught.message : 'Transaction failed.' })
    } finally {
      if (currentOperation.current === submittedOperation) setBusy(false)
    }
  }

  async function verifyAuthorization() {
    if (!address || !config || baseActionReason) return
    const submittedOperation = operationKey
    try {
      setBusy(true)
      setStatus({ kind: 'pending', message: 'Reading the authorization from the registry…' })
      const authorized = await isAuthorized(
        config.contracts.registry,
        address,
        burner as Address,
        target as Address,
      )
      if (currentOperation.current !== submittedOperation) return
      setVerified(authorized)
      setStatus({
        kind: authorized ? 'success' : 'idle',
        message: authorized
          ? 'This burner is authorized for this target.'
          : 'No matching authorization exists for this vault, burner, and target.',
      })
    } catch (caught: unknown) {
      if (currentOperation.current === submittedOperation) {
        setStatus({ kind: 'error', message: caught instanceof Error ? caught.message : 'Verification failed.' })
      }
    } finally {
      if (currentOperation.current === submittedOperation) setBusy(false)
    }
  }

  const scopeSummary = useMemo(() => {
    if (!reviewReady || !address) return null
    return { vault: address, burner: burner as Address, target: target as Address }
  }, [address, burner, reviewReady, target])

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#/"><span className="flame">🔥</span> RHBurnerPass</a>
        <div className="nav-actions">
          <span className="network-dot live">Testnet</span>
          <WalletControl />
        </div>
      </nav>

      <section className="hero portal-hero">
        <span className="pill">Vault authorization portal</span>
        <h1>Keep your vault away from the <span>mint site.</span></h1>
        <p>
          Give a disposable wallet permission to mint for one compatible collection—without giving it custody,
          approvals, or access to anything else in your vault.
        </p>
        <div className="safety-note">
          <strong>Important:</strong> RHBurnerPass isolates your vault; it does not make an unsafe mint contract safe.
          Use a low-value burner on the collection’s mint site.
        </div>
      </section>

      <section className="workflow-layout" id="authorize">
        <aside className="flow-steps" aria-label="Authorization steps">
          <div className={address ? 'complete' : 'active'}><span>1</span><p><strong>Connect vault</strong><small>This trusted portal is the only site your vault visits.</small></p></div>
          <div className={!address ? '' : reviewReady ? 'complete' : 'active'}><span>2</span><p><strong>Set the scope</strong><small>One burner and one compatible mint contract.</small></p></div>
          <div className={status.kind === 'success' ? 'complete' : reviewReady ? 'active' : ''}><span>3</span><p><strong>Authorize or revoke</strong><small>Review the exact addresses before signing.</small></p></div>
          <div><span>4</span><p><strong>Disconnect vault</strong><small>The burner mints later from the collection’s site.</small></p></div>
        </aside>

        <article className="card authorization-card">
          <div className="card-heading">
            <div><span className="eyebrow">TARGET-SCOPED PERMISSION</span><h2>Authorize a burner</h2></div>
            <span className="scope-badge">No custody</span>
          </div>

          {configError && <div className="inline-alert error">{configError}</div>}
          {wrongNetwork && <div className="inline-alert warning-box">Wrong network. Use the switch button above before continuing.</div>}

          <div className="identity-row">
            <span>Connected vault</span>
            <strong>{address ? short(address) : 'Not connected'}</strong>
            {address && <code>{address}</code>}
          </div>

          <label>
            Burner wallet
            <input
              aria-describedby="burner-help"
              placeholder="0x…"
              value={burner}
              onChange={(event) => setBurnerAddress(event.target.value.trim())}
              disabled={busy}
              spellCheck={false}
            />
            <small id="burner-help">A disposable wallet that will use the collection’s separate mint site.</small>
          </label>

          <label>
            Compatible target mint
            <input
              aria-describedby="target-help"
              placeholder="0x…"
              value={target}
              onChange={(event) => setTarget(event.target.value.trim())}
              disabled={busy}
              spellCheck={false}
            />
            <small id="target-help">Authorization applies only to this exact contract address. New authorizations require an on-chain official integration approval.</small>
          </label>

          <div className={`review-box ${scopeSummary ? 'ready' : ''}`}>
            <span className="eyebrow">REVIEW SCOPE</span>
            {scopeSummary ? (
              <p>
                Vault <code>{short(scopeSummary.vault)}</code> authorizes burner <code>{short(scopeSummary.burner)}</code>
                {' '}for target <code>{short(scopeSummary.target)}</code> only.
              </p>
            ) : <p>{baseActionReason ?? 'Complete the fields to review this authorization.'}</p>}
          </div>

          <div className="actions">
            <button className="primary" onClick={() => submitAuthorization(true)} disabled={!reviewReady || Boolean(authorizeReason) || busy}>
              {busy ? 'Working…' : 'Authorize burner'}
            </button>
            <button onClick={verifyAuthorization} disabled={!reviewReady || busy}>Verify on-chain</button>
            <button className="danger" onClick={() => submitAuthorization(false)} disabled={!reviewReady || busy}>Revoke</button>
          </div>
          {authorizeReason && <p className="disabled-reason">{authorizeReason}</p>}

          <div className={`status ${status.kind}`} role="status">
            <span>{status.message}</span>
            {status.hash && <a href={`${explorerBase}/tx/${status.hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}
            {verified !== null && <strong>{verified ? 'Registry: authorized' : 'Registry: not authorized'}</strong>}
          </div>
        </article>
      </section>

      <section className="scope-explainer">
        <article><span>01</span><h3>Vault keeps eligibility</h3><p>Your allowlist or holder identity remains attached to the vault.</p></article>
        <article><span>02</span><h3>Burner takes the risk</h3><p>The low-value wallet—not your vault—interacts with the collection frontend.</p></article>
        <article><span>03</span><h3>Claims stay honest</h3><p>Compatible mints count allocation against the vault, even across multiple burners.</p></article>
      </section>

      <footer>
        <div><strong>🔥 RHBurnerPass</strong><p>Experimental, unaudited, and testnet-only.</p></div>
        <a href="#/demo">Developer testnet demo</a>
      </footer>
    </main>
  )
}

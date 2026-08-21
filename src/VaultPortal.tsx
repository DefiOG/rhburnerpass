import { useEffect, useMemo, useRef, useState } from 'react'
import { isAddress, type Address, type Hex } from 'viem'
import { useAccount, useWalletClient } from 'wagmi'
import { useAppConfig } from './hooks'
import {
  authorizationInputError,
  assertFactoryTarget,
  assertOfficialTarget,
  isAuthorized,
  loadCollections,
  publicClient,
  robinhoodChain,
  setBurner,
  type CollectionEntry,
} from './rhburnerpass'
import { WalletControl } from './WalletControl'
import { ActivePermissionCard, CollectionPicker, ConfirmPermissionStep, PermissionExplainer } from './onboarding'
import { clearActivePermission, saveActivePermission, useActivePermission } from './permission'

type ActionStatus = {
  kind: 'idle' | 'pending' | 'success' | 'error'
  message: string
  hash?: Hex
}

const idleStatus: ActionStatus = {
  kind: 'idle',
  message: 'Connect your Safe Wallet to create or revoke a Permission.',
}

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function readQueryParam(name: string): string {
  try {
    return new URLSearchParams(window.location.search).get(name)?.trim() ?? ''
  } catch {
    return ''
  }
}

function readCollectionParam() {
  return readQueryParam('collection')
}

function readBurnerParam() {
  const candidate = readQueryParam('burner')
  return isAddress(candidate) ? candidate : ''
}

function readReturnUrl(): URL | null {
  const raw = readQueryParam('return')
  if (!raw) return null
  try {
    const url = new URL(raw)
    const localhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localhost)) return null
    return url
  } catch {
    return null
  }
}

export function VaultPortal() {
  const { config, error: configError } = useAppConfig()
  const { address, chainId, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [burner, setBurnerAddress] = useState(() => readBurnerParam())
  const [target, setTarget] = useState('')
  const [verified, setVerified] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<ActionStatus>(idleStatus)
  const [collections, setCollections] = useState<CollectionEntry[] | null>(null)
  const [collectionsError, setCollectionsError] = useState('')
  const [confirmingPermission, setConfirmingPermission] = useState(false)
  const [showTechnical, setShowTechnical] = useState(false)
  const [preselectPending, setPreselectPending] = useState(() => Boolean(readCollectionParam()))
  const sessionKey = `${address ?? ''}:${chainId ?? ''}`
  const operationKey = `${sessionKey}:${burner.toLowerCase()}:${target.toLowerCase()}`
  const currentOperation = useRef(operationKey)
  currentOperation.current = operationKey

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

  useEffect(() => {
    if (config?.sampleMint && !target && !readCollectionParam()) setTarget(config.sampleMint)
  }, [config, target])

  useEffect(() => {
    loadCollections(config?.collectionsUrl)
      .then((entries) => setCollections(entries))
      .catch((err: Error) => setCollectionsError(err.message))
  }, [config])

  // A ?collection=0x… link is never trusted at face value: it must pass the
  // same canonical Factory / official-integration validation as manual entry
  // before it is shown as selected.
  useEffect(() => {
    const candidate = readCollectionParam()
    if (!candidate || !config || !isAddress(candidate)) {
      setPreselectPending(false)
      return
    }
    let alive = true
    ;(async () => {
      try {
        if (config.contracts.factory) {
          await assertFactoryTarget(candidate as Address, config.contracts.factory, config.contracts.registry, config.contracts.feeVault)
        } else {
          await assertOfficialTarget(candidate as Address, config.contracts.registry, config.contracts.feeVault, config.contracts.officialIntegrationRegistry ?? '')
        }
        if (!alive) return
        setTarget(candidate)
      } catch (err) {
        if (alive) setCollectionsError(err instanceof Error ? err.message : 'The linked collection could not be validated.')
      } finally {
        if (alive) setPreselectPending(false)
      }
    })()
    return () => { alive = false }
  }, [config])

  const wrongNetwork = isConnected && chainId !== robinhoodChain.id
  const inputError = authorizationInputError(address ?? '', burner, target)
  const registryReady = Boolean(config && isAddress(config.contracts.registry))
  const factoryReady = Boolean(config && isAddress(config.contracts.factory ?? ''))
  const officialRegistryReady = Boolean(config && isAddress(config.contracts.officialIntegrationRegistry ?? ''))
  const baseActionReason = !registryReady
    ? 'The registry configuration is unavailable.'
    : wrongNetwork
      ? `Switch to ${robinhoodChain.name}.`
      : address && !walletClient
        ? 'The wallet session is still initializing.'
      : inputError
  const authorizeReason = baseActionReason ?? (!factoryReady && !officialRegistryReady
    ? 'No canonical integration authority is configured. New authorizations are disabled.'
    : null)

  const reviewReady = !baseActionReason
  const explorerBase = config?.network.explorerUrl ?? robinhoodChain.blockExplorers.default.url
  const repoBase = (config?.repoUrl ?? 'https://github.com/DefiOG/rhburnerpass').replace(/\/$/, '')
  const integrationGuideUrl = `${repoBase}/blob/main/INTEGRATION.md`
  const referenceSourceUrl = `${repoBase}/blob/main/contracts/RHBurnerPassReferenceMint.sol`
  const referenceMintAddress = '0x94FEa8Ea67f8B2B72c9c196aCAFd2C0471F30309'
  const referenceExplorerUrl = `${explorerBase}/address/${referenceMintAddress}`
  const returnUrl = useMemo(() => readReturnUrl(), [])
  const returnHost = returnUrl?.host ?? ''
  const continueLabel = returnUrl ? `Return to ${returnHost} →` : 'Continue with Mint Wallet →'
  const continueAfterPermission = () => {
    if (returnUrl) window.location.assign(returnUrl.toString())
    else window.location.hash = '#/mint'
  }

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
        setStatus({ kind: 'pending', message: config.contracts.factory ? 'Checking canonical Factory mint and protocol bindings…' : 'Checking official integration approval, code hash, Registry, and FeeVault…' })
        if (config.contracts.factory) {
          await assertFactoryTarget(targetAddress, config.contracts.factory, config.contracts.registry, config.contracts.feeVault)
        } else {
          await assertOfficialTarget(
            targetAddress,
            config.contracts.registry,
            config.contracts.feeVault,
            config.contracts.officialIntegrationRegistry ?? '',
          )
        }
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
      if (enabled) {
        saveActivePermission({ vault: address, burner: burnerAddress, mint: targetAddress })
      } else {
        clearActivePermission()
      }
      setStatus({
        kind: 'success',
        message: enabled
          ? 'Permission granted. Disconnect this Safe Wallet, switch to the Mint Wallet, then continue.'
          : 'Permission revoked. This Mint Wallet can no longer mint for this Safe Wallet on this collection.',
        hash,
      })
    } catch (caught: unknown) {
      if (currentOperation.current !== submittedOperation) return
      setStatus({ kind: 'error', message: caught instanceof Error ? caught.message : 'Transaction failed.' })
    } finally {
      if (currentOperation.current === submittedOperation) setBusy(false)
      setConfirmingPermission(false)
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

  const selectedCollection = useMemo(
    () => collections?.find((c) => c.address.toLowerCase() === target.toLowerCase()) ?? null,
    [collections, target],
  )

  const activePermission = useActivePermission()
  const activePermissionCollectionName = useMemo(
    () => collections?.find((c) => c.address.toLowerCase() === activePermission?.mint.toLowerCase())?.name,
    [collections, activePermission],
  )

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#/"><span className="flame">🔥</span> RHBurnerPass</a>
        <div className="nav-actions">
          <a className="developer-nav-link" href="#/mint">Burner mint</a><a className="developer-nav-link" href="#developers">Developers</a>
          <span className="network-dot live">{robinhoodChain.id === 46630 ? 'Testnet' : 'Mainnet'}</span>
          <WalletControl role="vault" />
        </div>
      </nav>

      <section className="hero portal-hero">
        <span className="pill">Safe Wallet permission portal</span>
        <h1>Keep your Safe Wallet away from the <span>mint site.</span></h1>
        <p>
          Give a disposable Mint Wallet permission to mint for one collection—without giving it custody,
          approvals, or access to anything else in your Safe Wallet.
        </p>
        <div className="safety-note">
          <strong>Important:</strong> RHBurnerPass isolates your Safe Wallet; it does not make an unsafe collection contract safe.
          Use a low-value Mint Wallet on the collection’s mint site.
        </div>
      </section>

      <PermissionExplainer />

      <section className="workflow-layout" id="authorize">
        <aside className="flow-steps" aria-label="Permission steps">
          <div className={address ? 'complete' : 'active'}><span>1</span><p><strong>Connect Safe Wallet</strong><small>This trusted portal is the only site your Safe Wallet visits.</small></p></div>
          <div className={!address ? '' : reviewReady ? 'complete' : 'active'}><span>2</span><p><strong>Pick a collection</strong><small>One Mint Wallet and one collection.</small></p></div>
          <div className={status.kind === 'success' ? 'complete' : reviewReady ? 'active' : ''}><span>3</span><p><strong>Review and confirm</strong><small>Double-check before signing.</small></p></div>
          <div className={verified === true ? 'active' : ''}><span>4</span><p><strong>Switch to Mint Wallet</strong><small>Then continue to the collection mint.</small></p></div>
        </aside>

        <article className="card authorization-card">
          <div className="card-heading">
            <div><span className="eyebrow">COLLECTION-SCOPED PERMISSION</span><h2>Give a Mint Wallet permission</h2></div>
            <span className="scope-badge">No custody</span>
          </div>

          {configError && <div className="inline-alert error">{configError}</div>}
          {wrongNetwork && <div className="inline-alert warning-box">Wrong network. Use the switch button above before continuing.</div>}

          <div className="identity-row">
            <span>Connected Safe Wallet</span>
            <strong>{address ? short(address) : 'Not connected'}</strong>
            {address && <code>{address}</code>}
          </div>

          {!confirmingPermission ? (
            <>
              <label>
                Mint Wallet
                <input
                  aria-describedby="burner-help"
                  placeholder="0x…"
                  value={burner}
                  onChange={(event) => setBurnerAddress(event.target.value.trim())}
                  disabled={busy}
                  spellCheck={false}
                />
                <small id="burner-help">A disposable wallet that will use the collection’s separate mint site.{readBurnerParam() && ' Prefilled by the collection link — verify it before signing.'}</small>
              </label>

              {preselectPending && <p className="disabled-reason">Validating the linked collection…</p>}
              <CollectionPicker
                collections={collections}
                loadError={collectionsError}
                value={target}
                onChange={setTarget}
                disabled={busy}
              />

              <div className={`review-box ${scopeSummary ? 'ready' : ''}`}>
                <span className="eyebrow">REVIEW SCOPE</span>
                {scopeSummary ? (
                  <p>
                    Safe Wallet <code>{short(scopeSummary.vault)}</code> gives Mint Wallet <code>{short(scopeSummary.burner)}</code>
                    {' '}permission for <code>{short(scopeSummary.target)}</code> only.
                  </p>
                ) : <p>{baseActionReason ?? 'Complete the fields to review this permission.'}</p>}
              </div>

              <div className="actions">
                <button
                  className="primary"
                  onClick={() => setConfirmingPermission(true)}
                  disabled={!reviewReady || Boolean(authorizeReason) || busy}
                >
                  Continue
                </button>
                <button onClick={verifyAuthorization} disabled={!reviewReady || busy}>Verify on-chain</button>
                <button className="danger" onClick={() => submitAuthorization(false)} disabled={!reviewReady || busy}>Revoke</button>
              </div>
              {authorizeReason && <p className="disabled-reason">{authorizeReason}</p>}
            </>
          ) : (
            <ConfirmPermissionStep
              vault={address ?? ''}
              burner={burner}
              collectionName={selectedCollection?.name ?? 'This collection'}
              collectionAddress={target}
              verified={selectedCollection?.verified ?? null}
              busy={busy}
              onConfirm={() => submitAuthorization(true)}
              onBack={() => setConfirmingPermission(false)}
            />
          )}

          <div className={`status ${status.kind}`} role="status">
            <span>{status.message}</span>
            {status.hash && <a href={`${explorerBase}/tx/${status.hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}
            {verified !== null && <strong>{verified ? 'Registry: authorized' : 'Registry: not authorized'}</strong>}
            {verified === true && status.kind === 'success' && (
              <button type="button" className="status-cta" onClick={continueAfterPermission}>{continueLabel}</button>
            )}
          </div>

          {activePermission && (
            <ActivePermissionCard
              vault={activePermission.vault}
              burner={activePermission.burner}
              mint={activePermission.mint}
              collectionName={activePermissionCollectionName}
              onContinue={continueAfterPermission}
              continueLabel={continueLabel}
            />
          )}

          <button type="button" className="text-action inline-toggle" onClick={() => setShowTechnical((v) => !v)}>
            {showTechnical ? 'Hide technical details' : 'Show technical details'}
          </button>
          {showTechnical && (
            <div className="technical-details">
              <div><span>Registry</span><code>{config?.contracts.registry ?? '—'}</code></div>
              <div><span>Factory</span><code>{config?.contracts.factory ?? '—'}</code></div>
              <div><span>Fee vault</span><code>{config?.contracts.feeVault ?? '—'}</code></div>
              {address && <div><span>Vault (Safe Wallet)</span><code>{address}</code></div>}
              {burner && <div><span>Burner (Mint Wallet)</span><code>{burner}</code></div>}
              {target && <div><span>Target (Collection)</span><code>{target}</code></div>}
            </div>
          )}
        </article>
      </section>

      <section className="scope-explainer">
        <article><span>01</span><h3>Safe Wallet keeps eligibility</h3><p>Your allowlist or holder identity remains attached to the Safe Wallet.</p></article>
        <article><span>02</span><h3>Mint Wallet takes the risk</h3><p>The low-value wallet—not your Safe Wallet—interacts with the collection frontend.</p></article>
        <article><span>03</span><h3>Claims stay honest</h3><p>Compatible mints count allocation against the Safe Wallet, even across multiple Mint Wallets.</p></article>
      </section>

      <section className="developer-entry" id="developers">
        <div className="developer-copy">
          <span className="eyebrow">FOR COLLECTION DEVELOPERS</span>
          <h2>Deploy a protected mint. Earn 10% of RHBP fees.</h2>
          <p>
            Use the self-service Factory to deploy a canonical RHBurnerPass mint with no manual approval queue.
            Your payout wallet receives 10% of the RHBP fee generated by protected mints through your collection.
          </p>

          <div className="developer-steps" aria-label="Developer integration steps">
            <div><span>1</span><p><strong>Configure locally</strong><small>Set collection details, allowlist, mint price, and your 10% payout wallet.</small></p></div>
            <div><span>2</span><p><strong>Deploy through Factory</strong><small>The canonical Registry and FeeVault bindings are wired automatically.</small></p></div>
            <div><span>3</span><p><strong>Launch your mint page</strong><small>Collectors authorize once with the vault, then mint from a burner.</small></p></div>
          </div>

          <div className="developer-actions">
            <a className="developer-button primary-link" href={integrationGuideUrl} target="_blank" rel="noreferrer">
              Integration guide ↗
            </a>
            <a className="developer-button" href={referenceSourceUrl} target="_blank" rel="noreferrer">
              Reference contract ↗
            </a>
          </div>
        </div>

        <aside className="developer-proof">
          <span className="proof-label">MAINNET PROOF</span>
          <strong>Production reference integration</strong>
          <code>{referenceMintAddress}</code>
          <ul>
            <li>Source verified on Robinhood Chain</li>
            <li>Approved by the RHBurnerPass 2-of-3 Safe</li>
            <li>Protected mint completed on mainnet</li>
            <li>0.00005 ETH protocol fee confirmed</li>
            <li>Vault revocation confirmed on-chain</li>
          </ul>
          <a href={referenceExplorerUrl} target="_blank" rel="noreferrer">View reference mint on Blockscout ↗</a>
          <small>RHBurnerPass has not received an independent professional audit.</small>
        </aside>
      </section>

      <footer>
        <div>
          <strong>🔥 RHBurnerPass</strong>
          <p>{robinhoodChain.id === 46630 ? 'Robinhood Chain testnet' : 'Robinhood Chain mainnet'}. Independent community project; not affiliated with or endorsed by Robinhood Markets, Inc.</p>
        </div>
        <a href={config?.repoUrl ?? 'https://github.com/DefiOG/rhburnerpass'} target="_blank" rel="noreferrer">Source code ↗</a>
      </footer>
    </main>
  )
}

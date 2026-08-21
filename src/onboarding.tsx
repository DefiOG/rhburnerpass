import { useEffect, useState } from 'react'
import { isAddress } from 'viem'
import type { CollectionEntry } from './rhburnerpass'

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** Plain-language explainer shown above the authorization form. */
export function PermissionExplainer() {
  return (
    <div className="explainer-steps" aria-label="How RHBurnerPass works">
      <div>
        <span className="explainer-icon">🔒</span>
        <p><strong>Your Safe Wallet</strong> gives permission — it never touches the collection site.</p>
      </div>
      <div>
        <span className="explainer-icon">🎯</span>
        <p><strong>Permission is scoped</strong> to one Collection only.</p>
      </div>
      <div>
        <span className="explainer-icon">🖱️</span>
        <p><strong>Your Mint Wallet</strong> is the one that interacts with the Collection and mints.</p>
      </div>
      <div>
        <span className="explainer-icon">🎁</span>
        <p><strong>The NFT lands</strong> in your Mint Wallet, not your Safe Wallet.</p>
      </div>
    </div>
  )
}

/** A collection picker that defaults to a curated directory, with a manual-entry escape hatch. */
export function CollectionPicker({
  collections,
  loadError,
  value,
  onChange,
  disabled,
}: {
  collections: CollectionEntry[] | null
  loadError?: string
  value: string
  onChange: (address: string) => void
  disabled?: boolean
}) {
  const matched = collections?.find((c) => c.address.toLowerCase() === value.toLowerCase()) ?? null
  const [manual, setManual] = useState(() => Boolean(value) && !matched)

  useEffect(() => {
    if (value && !matched && collections) setManual(true)
  }, [collections, matched, value])

  if (manual || !collections || collections.length === 0) {
    return (
      <label>
        Collection contract {loadError ? <small className="field-warning">(directory unavailable — enter manually)</small> : null}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="0x…"
          spellCheck={false}
          disabled={disabled}
        />
        <small id="target-help">
          Permission applies only to this exact contract address. Factory-created collections are recognized automatically.
        </small>
        {collections && collections.length > 0 && (
          <button type="button" className="text-action inline-toggle" onClick={() => setManual(false)}>
            ← Choose from the list instead
          </button>
        )}
      </label>
    )
  }

  return (
    <div className="collection-picker">
      <span className="field-title">Collection</span>
      <div className="collection-list" role="listbox" aria-label="Supported collections">
        {collections.map((entry) => {
          const selected = entry.address.toLowerCase() === value.toLowerCase()
          return (
            <button
              type="button"
              key={entry.address}
              role="option"
              aria-selected={selected}
              className={`collection-option ${selected ? 'selected' : ''}`}
              onClick={() => onChange(entry.address)}
              disabled={disabled}
            >
              <span className="collection-avatar" aria-hidden>{entry.name.slice(0, 1).toUpperCase()}</span>
              <span className="collection-meta">
                <span className="collection-name">
                  {entry.name} {entry.verified && <span className="verified-badge" title="Canonical / verified">✓ Canonical</span>}
                </span>
                <code>{short(entry.address)}</code>
              </span>
            </button>
          )
        })}
      </div>
      <button type="button" className="text-action inline-toggle" onClick={() => setManual(true)}>
        Advanced: enter contract manually →
      </button>
    </div>
  )
}

/** Explicit review-before-signature step. */
export function ConfirmPermissionStep({
  vault,
  burner,
  collectionName,
  collectionAddress,
  verified,
  busy,
  onConfirm,
  onBack,
}: {
  vault: string
  burner: string
  collectionName: string
  collectionAddress: string
  verified: boolean | null
  busy: boolean
  onConfirm: () => void
  onBack: () => void
}) {
  return (
    <div className="confirm-permission">
      <span className="eyebrow">REVIEW BEFORE SIGNING</span>
      <div className="confirm-row"><span>Safe Wallet</span><code>{short(vault)}</code></div>
      <div className="confirm-row"><span>Mint Wallet</span><code>{short(burner)}</code></div>
      <div className="confirm-row">
        <span>Collection</span>
        <span>
          {collectionName} {verified && <span className="verified-badge">✓ Canonical</span>}
          <br /><code>{short(collectionAddress)}</code>
        </span>
      </div>
      <p className="confirm-note">This permission works only for this collection. It does not give the Mint Wallet access to anything else in your Safe Wallet.</p>
      <div className="actions">
        <button className="primary" onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : 'Confirm Permission'}</button>
        <button onClick={onBack} disabled={busy}>Back</button>
      </div>
    </div>
  )
}

/** Persistent, visible view of the saved handoff state, replacing "trust it silently happened". */
export function ActivePermissionCard({
  vault,
  burner,
  mint,
  collectionName,
  onContinue,
}: {
  vault: string
  burner: string
  mint: string
  collectionName?: string
  onContinue?: () => void
}) {
  return (
    <div className="active-permission-card">
      <span className="eyebrow">ACTIVE PERMISSION</span>
      <div className="confirm-row"><span>Safe Wallet</span><code>{short(vault)}</code></div>
      <div className="confirm-row"><span>Mint Wallet</span><code>{short(burner)}</code></div>
      <div className="confirm-row"><span>Collection</span><span>{collectionName ?? short(mint)}</span></div>
      {onContinue && (
        <button className="primary status-cta" onClick={onContinue}>Continue with Mint Wallet →</button>
      )}
    </div>
  )
}

/** Friendly guidance when the connected wallet isn't the expected Mint Wallet. */
export function WalletMismatchNotice({ expected, connected }: { expected: string; connected: string }) {
  return (
    <div className="inline-alert warning-box wallet-mismatch">
      <p>This browser has the wrong wallet connected for this permission.</p>
      <div className="confirm-row"><span>Expected Mint Wallet</span><code>{short(expected)}</code></div>
      <div className="confirm-row"><span>Currently connected</span><code>{short(connected)}</code></div>
      <p className="confirm-note">Open your wallet extension or app and switch accounts to the Mint Wallet above, then continue.</p>
    </div>
  )
}

export function isValidAddress(value: string) {
  return isAddress(value)
}

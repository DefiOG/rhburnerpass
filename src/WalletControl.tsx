import { useEffect, useState } from 'react'
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { robinhoodChain } from './rhburnerpass'
import { walletConnectEnabled } from './wallet'

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function WalletControl({ role = 'wallet' }: { role?: 'vault' | 'burner' | 'wallet' }) {
  const { address, isConnected, chainId, connector: activeConnector } = useAccount()
  const { connectors, connect, error: connectError, isPending, variables } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const [modalOpen, setModalOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const wrongNetwork = isConnected && chainId !== robinhoodChain.id

  useEffect(() => {
    if (isConnected) setModalOpen(false)
  }, [isConnected])

  useEffect(() => {
    if (!modalOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModalOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [modalOpen])

  function changeWallet() {
    disconnect()
    setAccountMenuOpen(false)
    setModalOpen(true)
  }

  return (
    <div className="wallet-control">
      {wrongNetwork ? (
        <button
          className="network-switch"
          disabled={isSwitching}
          onClick={() => switchChain({ chainId: robinhoodChain.id })}
        >
          {isSwitching ? 'Switching…' : 'Switch network'}
        </button>
      ) : isConnected ? <span className="chain-chip">Robinhood Chain</span> : null}

      {isConnected && address ? (
        <div className="account-menu-wrap">
          <button
            className="account-button"
            aria-expanded={accountMenuOpen}
            aria-haspopup="menu"
            onClick={() => setAccountMenuOpen((open) => !open)}
          >
            <span className="wallet-indicator" />
            {short(address)}
          </button>
          {accountMenuOpen && (
            <div className="account-menu" role="menu">
              <div><span>Connected with</span><strong>{activeConnector?.name ?? 'Wallet'}</strong></div>
              <code>{address}</code>
              <button role="menuitem" onClick={changeWallet}>Change wallet</button>
              <button role="menuitem" className="danger" onClick={() => { disconnect(); setAccountMenuOpen(false) }}>Disconnect</button>
            </div>
          )}
        </div>
      ) : (
        <button className="connect-button" onClick={() => setModalOpen(true)}>Connect wallet</button>
      )}

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setModalOpen(false)}>
          <section
            className="wallet-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div><span className="eyebrow">SECURE CONNECTION</span><h2 id="wallet-modal-title">Choose a wallet</h2></div>
              <button className="modal-close" aria-label="Close wallet dialog" onClick={() => setModalOpen(false)}>×</button>
            </div>
            <p className="modal-copy">{role === 'vault' ? 'Connect the wallet that owns the allowlist or holder eligibility.' : role === 'burner' ? 'Connect the low-value burner that will send the mint transaction and receive the NFT.' : 'Connect the wallet you want to use.'} RHBurnerPass never asks for a seed phrase or private key.</p>
            <div className="wallet-options">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  disabled={isPending}
                  onClick={() => connect({ connector })}
                >
                  {connector.icon ? <img src={connector.icon} alt="" /> : <span className="wallet-fallback">◈</span>}
                  <span><strong>{connector.name}</strong><small>{connector.type === 'injected' ? 'Browser extension' : 'Wallet connection'}</small></span>
                  {isPending && variables?.connector === connector ? <em>Connecting…</em> : <em>Connect</em>}
                </button>
              ))}
            </div>
            {connectors.length === 0 && <div className="inline-alert warning-box">No compatible wallet was detected.</div>}
            {connectError && <div className="inline-alert error">{connectError.message}</div>}
            {!walletConnectEnabled && <p className="modal-footnote">Mobile QR connections are disabled for this deployment. Installed EIP-6963 wallets remain available.</p>}
          </section>
        </div>
      )}
    </div>
  )
}

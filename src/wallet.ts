import { createConfig, http, type CreateConnectorFn } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { robinhoodChain } from './rhburnerpass'

const configuredProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim()

export const walletConnectEnabled = Boolean(configuredProjectId)

const connectors: CreateConnectorFn[] = [injected()]

if (configuredProjectId) {
  connectors.push(walletConnect({ projectId: configuredProjectId, showQrModal: true }))
}

export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  connectors,
  multiInjectedProviderDiscovery: true,
  transports: {
    46630: http('https://rpc.testnet.chain.robinhood.com'),
    4663: http('https://rpc.mainnet.chain.robinhood.com'),
  },
  ssr: false,
})

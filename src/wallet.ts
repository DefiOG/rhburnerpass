import { createConfig, http, type CreateConnectorFn } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { robinhoodChainTestnet } from './rhburnerpass'

const configuredProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim()

export const walletConnectEnabled = Boolean(configuredProjectId)

const connectors: CreateConnectorFn[] = [injected()]

if (configuredProjectId) {
  connectors.push(walletConnect({ projectId: configuredProjectId, showQrModal: true }))
}

export const wagmiConfig = createConfig({
  chains: [robinhoodChainTestnet],
  connectors,
  multiInjectedProviderDiscovery: true,
  transports: {
    [robinhoodChainTestnet.id]: http(robinhoodChainTestnet.rpcUrls.default.http[0]),
  },
  ssr: false,
})

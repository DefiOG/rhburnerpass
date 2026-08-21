/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string
  readonly VITE_RHBP_NETWORK?: 'testnet' | 'mainnet'
  readonly VITE_RHBP_CONFIG_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

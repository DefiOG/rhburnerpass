import fs from 'node:fs'

const files = {
  rh: 'src/rhburnerpass.ts',
  wallet: 'src/wallet.ts',
  portal: 'src/VaultPortal.tsx',
  walletControl: 'src/WalletControl.tsx',
  app: 'src/App.tsx',
  demo: 'src/DeveloperDemo.tsx',
  tests: 'src/rhburnerpass.test.ts',
  config: 'public/config.json',
}

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing expected file: ${path}`)
  return fs.readFileSync(path, 'utf8')
}

function replaceRequired(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Could not find expected ${label}. Nothing was written.`)
  return text.replace(from, to)
}

const original = Object.fromEntries(
  Object.entries(files).map(([key, path]) => [key, read(path)]),
)

let rh = original.rh
rh = replaceRequired(
  rh,
`export const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com'] } },
  blockExplorers: {
    default: { name: 'Robinhood Chain Testnet Explorer', url: 'https://explorer.testnet.chain.robinhood.com' },
  },
  testnet: true,
})`,
`export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: {
    default: { name: 'Robinhood Chain Explorer', url: 'https://robinhoodchain.blockscout.com' },
  },
})`,
  'Robinhood testnet chain definition',
)

rh = replaceRequired(
  rh,
  `contracts: { registry: string; feeVault: string; demoMint: string; officialIntegrationRegistry?: string }`,
  `contracts: { registry: string; feeVault: string; demoMint?: string; officialIntegrationRegistry?: string }`,
  'RHBPConfig contracts type',
)

rh = rh.replaceAll('robinhoodChainTestnet', 'robinhoodChain')

let wallet = original.wallet
wallet = wallet.replaceAll('robinhoodChainTestnet', 'robinhoodChain')

let portal = original.portal
portal = portal.replaceAll('robinhoodChainTestnet', 'robinhoodChain')

portal = replaceRequired(
  portal,
`  useEffect(() => {
    if (config?.contracts.demoMint && !target) setTarget(config.contracts.demoMint)
  }, [config, target])

`,
  '',
  'testnet demo target auto-fill effect',
)

portal = replaceRequired(
  portal,
  `<span className="network-dot live">Testnet</span>`,
  `<span className="network-dot live">Mainnet</span>`,
  'portal Testnet badge',
)

portal = replaceRequired(
  portal,
`      <footer>
        <div><strong>🔥 RHBurnerPass</strong><p>Experimental, unaudited, and testnet-only.</p></div>
        <a href="#/demo">Developer testnet demo</a>
      </footer>`,
`      <footer>
        <div>
          <strong>🔥 RHBurnerPass</strong>
          <p>Robinhood Chain mainnet. Independent community project; not affiliated with or endorsed by Robinhood Markets, Inc.</p>
        </div>
        <a href={config?.repoUrl ?? 'https://github.com/DefiOG/rhburnerpass'} target="_blank" rel="noreferrer">Source code ↗</a>
      </footer>`,
  'portal testnet footer',
)

let walletControl = original.walletControl
walletControl = walletControl.replaceAll('robinhoodChainTestnet', 'robinhoodChain')
walletControl = replaceRequired(
  walletControl,
  `<span className="chain-chip">Robinhood Testnet</span>`,
  `<span className="chain-chip">Robinhood Chain</span>`,
  'wallet Testnet chip',
)

let tests = original.tests
tests = tests.replaceAll('robinhoodChainTestnet', 'robinhoodChain')

const app = `import { VaultPortal } from './VaultPortal'

export function App() {
  return <VaultPortal />
}
`

const demo = `export function DeveloperDemo() {
  return (
    <main>
      <section className="demo-header">
        <a className="back-link" href="#/">← Back to vault portal</a>
        <span className="pill demo-pill">Disabled in mainnet build</span>
        <h1>Developer testnet demo unavailable</h1>
        <p>
          The production RHBurnerPass frontend does not expose the testnet reference mint.
          Use the tagged testnet release or a separate local testnet checkout for integration testing.
        </p>
      </section>
    </main>
  )
}
`

const config = {
  network: {
    chainId: 4663,
    name: 'Robinhood Chain',
    rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
    explorerUrl: 'https://robinhoodchain.blockscout.com',
  },
  contracts: {
    registry: '0xA6D25fD2214C6c136599F65bDc07DE77A5f67d6e',
    feeVault: '0xd3e873CCE414a0a24F9E888236faCe40ab6C02DA',
    officialIntegrationRegistry: '0xb8d1f6F919B5A19B1EA1036f2358f21184f4C282',
  },
  feePerNftEth: '0.00005',
  repoUrl: 'https://github.com/DefiOG/rhburnerpass',
}

const candidate = {
  rh,
  wallet,
  portal,
  walletControl,
  app,
  demo,
  tests,
  config: `${JSON.stringify(config, null, 2)}\n`,
}

const critical = [
  ['src/rhburnerpass.ts', candidate.rh],
  ['src/wallet.ts', candidate.wallet],
  ['src/VaultPortal.tsx', candidate.portal],
  ['src/WalletControl.tsx', candidate.walletControl],
  ['src/App.tsx', candidate.app],
  ['public/config.json', candidate.config],
]

for (const [name, text] of critical) {
  for (const forbidden of ['46630', 'Robinhood Chain Testnet', 'rpc.testnet.chain.robinhood.com', 'explorer.testnet.chain.robinhood.com']) {
    if (text.includes(forbidden)) {
      throw new Error(`${name} still contains forbidden production value: ${forbidden}. Nothing was written.`)
    }
  }
}

if (!candidate.rh.includes('id: 4663')) throw new Error('Mainnet chain ID missing from rhburnerpass.ts.')
if (!candidate.wallet.includes('robinhoodChain')) throw new Error('wallet.ts was not switched to mainnet chain.')
if (!candidate.portal.includes('Mainnet')) throw new Error('VaultPortal mainnet badge missing.')
if (candidate.app.includes('DeveloperDemo')) throw new Error('Developer demo is still routed in App.tsx.')

for (const [key, path] of Object.entries(files)) {
  fs.writeFileSync(path, candidate[key], 'utf8')
}

console.log('RHBurnerPass frontend switched to Robinhood Chain MAINNET.')
console.log('')
console.log('Network:')
console.log('  Chain ID: 4663')
console.log('  RPC: https://rpc.mainnet.chain.robinhood.com')
console.log('  Explorer: https://robinhoodchain.blockscout.com')
console.log('')
console.log('Production contracts:')
console.log('  RegistryV2: 0xA6D25fD2214C6c136599F65bDc07DE77A5f67d6e')
console.log('  FeeVaultV2: 0xd3e873CCE414a0a24F9E888236faCe40ab6C02DA')
console.log('  OfficialIntegrationRegistry: 0xb8d1f6F919B5A19B1EA1036f2358f21184f4C282')
console.log('')
console.log('The testnet demo route is disabled in the production build.')
console.log('No wallet transaction was signed or sent.')

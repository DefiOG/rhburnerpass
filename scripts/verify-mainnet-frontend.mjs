import fs from 'node:fs'

const expected = {
  registry: '0xA6D25fD2214C6c136599F65bDc07DE77A5f67d6e',
  feeVault: '0xd3e873CCE414a0a24F9E888236faCe40ab6C02DA',
  official: '0xb8d1f6F919B5A19B1EA1036f2358f21184f4C282',
}

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}`)
  return fs.readFileSync(path, 'utf8')
}

const config = JSON.parse(read('public/config.json'))

if (config.network?.chainId !== 4663) throw new Error(`config.json chainId is ${config.network?.chainId}, expected 4663.`)
if (config.network?.name !== 'Robinhood Chain') throw new Error('config.json network name is not Robinhood Chain.')
if (config.contracts?.registry?.toLowerCase() !== expected.registry.toLowerCase()) throw new Error('RegistryV2 address mismatch.')
if (config.contracts?.feeVault?.toLowerCase() !== expected.feeVault.toLowerCase()) throw new Error('FeeVaultV2 address mismatch.')
if (config.contracts?.officialIntegrationRegistry?.toLowerCase() !== expected.official.toLowerCase()) throw new Error('OfficialIntegrationRegistry address mismatch.')
if (config.contracts?.demoMint) throw new Error('A demoMint is configured in the production public config.')

const criticalFiles = [
  'public/config.json',
  'src/rhburnerpass.ts',
  'src/wallet.ts',
  'src/VaultPortal.tsx',
  'src/WalletControl.tsx',
  'src/App.tsx',
]

const forbidden = [
  '46630',
  'Robinhood Chain Testnet',
  'rpc.testnet.chain.robinhood.com',
  'explorer.testnet.chain.robinhood.com',
  'Developer testnet demo',
  'testnet-only',
]

for (const path of criticalFiles) {
  const text = read(path)
  for (const value of forbidden) {
    if (text.includes(value)) throw new Error(`${path} still contains testnet production marker: ${value}`)
  }
}

const rh = read('src/rhburnerpass.ts')
if (!rh.includes("id: 4663")) throw new Error('src/rhburnerpass.ts does not define chain 4663.')
if (!rh.includes("https://rpc.mainnet.chain.robinhood.com")) throw new Error('src/rhburnerpass.ts does not use Robinhood mainnet RPC.')

const app = read('src/App.tsx')
if (app.includes('DeveloperDemo')) throw new Error('Production App.tsx still routes DeveloperDemo.')

console.log('RHBurnerPass MAINNET frontend verification: PASSED')
console.log('Chain ID: 4663')
console.log(`RegistryV2: ${expected.registry}`)
console.log(`FeeVaultV2: ${expected.feeVault}`)
console.log(`OfficialIntegrationRegistry: ${expected.official}`)
console.log('Developer testnet route: disabled')
console.log('No testnet production markers found in critical frontend files.')
console.log('No transaction was signed or sent.')

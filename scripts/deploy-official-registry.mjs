import fs from 'node:fs'
import { createPublicClient, createWalletClient, defineChain, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const rpc = process.env.RH_RPC_URL || 'https://rpc.testnet.chain.robinhood.com'
const key = process.env.DEPLOYER_PRIVATE_KEY
if (!key) throw new Error('Set DEPLOYER_PRIVATE_KEY in your local .env. Use a disposable testnet deployer for alpha.')

const configPath = 'public/config.json'
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const registry = process.env.RHBP_REGISTRY_ADDRESS || config.contracts?.registry
const feeVault = process.env.RHBP_FEE_VAULT_ADDRESS || config.contracts?.feeVault
if (!registry || !feeVault) throw new Error('Registry and FeeVault addresses are required in .env or public/config.json.')

const chain = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
})
const account = privateKeyToAccount(key)
const owner = process.env.PROTOCOL_OWNER_ADDRESS || account.address
const wallet = createWalletClient({ account, chain, transport: http(rpc) })
const publicClient = createPublicClient({ chain, transport: http(rpc) })
const artifact = JSON.parse(fs.readFileSync('artifacts/RHBurnerPassOfficialIntegrationRegistry.json', 'utf8'))

const deployHash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [owner, feeVault],
})
console.log(`Official integration registry deploy tx: ${deployHash}`)
const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash })
const officialRegistry = deployReceipt.contractAddress
if (!officialRegistry) throw new Error('Deployment receipt did not include a contract address.')
console.log(`RHBurnerPassOfficialIntegrationRegistry: ${officialRegistry}`)

const bindHash = await wallet.writeContract({
  account,
  address: officialRegistry,
  abi: artifact.abi,
  functionName: 'bindCanonicalRegistry',
  args: [registry],
})
console.log(`Bind canonical Registry tx: ${bindHash}`)
await publicClient.waitForTransactionReceipt({ hash: bindHash })

config.contracts = { ...config.contracts, officialIntegrationRegistry: officialRegistry }
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
console.log(`Updated ${configPath}`)
console.log('\nAdd to .env:')
console.log(`RHBP_OFFICIAL_INTEGRATION_REGISTRY_ADDRESS=${officialRegistry}`)
console.log('\nNext, approve the demo/current target with:')
console.log('npm run approve:integration')

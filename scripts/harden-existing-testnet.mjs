import fs from 'node:fs'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  http,
  isAddress,
  keccak256,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const rpc = process.env.RH_RPC_URL || 'https://rpc.testnet.chain.robinhood.com'
const key = process.env.DEPLOYER_PRIVATE_KEY
if (!key) throw new Error('Set DEPLOYER_PRIVATE_KEY in your local .env. Use a disposable testnet deployer for alpha.')

const configPath = 'public/config.json'
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const registry = process.env.RHBP_REGISTRY_ADDRESS || config.contracts?.registry
const feeVault = process.env.RHBP_FEE_VAULT_ADDRESS || config.contracts?.feeVault
const target = process.env.TARGET_MINT_ADDRESS || config.contracts?.demoMint
if (!isAddress(registry) || !isAddress(feeVault)) throw new Error('Existing Registry/FeeVault addresses are missing from .env or public/config.json.')
if (!isAddress(target)) throw new Error('Demo/target mint address is missing from public/config.json or TARGET_MINT_ADDRESS.')

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

console.log('Hardening existing RHBurnerPass testnet deployment without replacing Registry/FeeVault...')
console.log(`Canonical Registry: ${registry}`)
console.log(`Canonical FeeVault: ${feeVault}`)
console.log(`Protocol owner: ${owner}`)

const deployHash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [owner, feeVault],
})
console.log(`Official registry deploy tx: ${deployHash}`)
const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash })
const officialRegistry = deployReceipt.contractAddress
if (!officialRegistry) throw new Error('Official Integration Registry deployment did not return a contract address.')
console.log(`Official Integration Registry: ${officialRegistry}`)

const bindHash = await wallet.writeContract({
  account,
  address: officialRegistry,
  abi: artifact.abi,
  functionName: 'bindCanonicalRegistry',
  args: [registry],
})
console.log(`Bind canonical Registry tx: ${bindHash}`)
const bindReceipt = await publicClient.waitForTransactionReceipt({ hash: bindHash })
if (bindReceipt.status !== 'success') throw new Error('Canonical Registry bind reverted.')

config.contracts = { ...config.contracts, officialIntegrationRegistry: officialRegistry }
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
console.log(`Updated ${configPath}`)

const bytecode = await publicClient.getBytecode({ address: target })
if (!bytecode || bytecode === '0x') throw new Error('Configured target has no deployed bytecode.')
const codeHash = keccak256(bytecode)
console.log(`Target for approval: ${target}`)
console.log(`Target runtime code hash: ${codeHash}`)

if (owner.toLowerCase() === account.address.toLowerCase()) {
  const approveHash = await wallet.writeContract({
    account,
    address: officialRegistry,
    abi: artifact.abi,
    functionName: 'approveIntegration',
    args: [target, codeHash],
  })
  console.log(`Approve target tx: ${approveHash}`)
  const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
  if (approveReceipt.status !== 'success') throw new Error('Integration approval reverted.')
  const official = await publicClient.readContract({
    address: officialRegistry,
    abi: artifact.abi,
    functionName: 'isOfficialIntegration',
    args: [target],
  })
  console.log(`Official integration verified: ${official}`)
} else {
  const data = encodeFunctionData({
    abi: artifact.abi,
    functionName: 'approveIntegration',
    args: [target, codeHash],
  })
  console.log('\nProtocol owner is different from the deployer. Submit this approval from the owner/multisig:')
  console.log(`To: ${officialRegistry}`)
  console.log(`Data: ${data}`)
}

console.log('\nAdd this public address to your local .env if desired:')
console.log(`RHBP_OFFICIAL_INTEGRATION_REGISTRY_ADDRESS=${officialRegistry}`)
console.log('\nExisting Registry and FeeVault were not redeployed or modified.')

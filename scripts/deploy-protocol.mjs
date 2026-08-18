import fs from 'node:fs'
import { createPublicClient, createWalletClient, defineChain, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const rpc = process.env.RH_RPC_URL || 'https://rpc.testnet.chain.robinhood.com'
const key = process.env.DEPLOYER_PRIVATE_KEY
const treasury = process.env.TREASURY_ADDRESS
if (!key || !treasury) throw new Error('Set DEPLOYER_PRIVATE_KEY and TREASURY_ADDRESS in your local environment.')

const chain = defineChain({ id: 46630, name: 'Robinhood Chain Testnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } })
const account = privateKeyToAccount(key)
const protocolOwner = process.env.PROTOCOL_OWNER_ADDRESS || account.address
const wallet = createWalletClient({ account, chain, transport: http(rpc) })
const publicClient = createPublicClient({ chain, transport: http(rpc) })

function artifact(name) { return JSON.parse(fs.readFileSync(`artifacts/${name}.json`, 'utf8')) }
async function deploy(name, args = []) {
  const a = artifact(name)
  const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode, args })
  console.log(`${name} tx: ${hash}`)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (!receipt.contractAddress) throw new Error(`${name} deployment did not return a contract address.`)
  console.log(`${name}: ${receipt.contractAddress}`)
  return receipt.contractAddress
}

// Production-design deployment order:
// 1. fixed-fee FeeVault V2
// 2. official integration registry
// 3. Registry V2, which refuses new delegations to non-official targets
// 4. one-time bind of the canonical Registry into the integration registry
const feeVault = await deploy('RHBurnerPassFeeVaultV2', [treasury])
const officialRegistry = await deploy('RHBurnerPassOfficialIntegrationRegistry', [protocolOwner, feeVault])
const registry = await deploy('RHBurnerPassRegistryV2', [officialRegistry])

const officialArtifact = artifact('RHBurnerPassOfficialIntegrationRegistry')
const bindHash = await wallet.writeContract({
  account,
  address: officialRegistry,
  abi: officialArtifact.abi,
  functionName: 'bindCanonicalRegistry',
  args: [registry],
})
console.log(`Bind canonical Registry tx: ${bindHash}`)
await publicClient.waitForTransactionReceipt({ hash: bindHash })

console.log('\nProtocol configuration:')
console.log(`RHBP_REGISTRY_ADDRESS=${registry}`)
console.log(`RHBP_FEE_VAULT_ADDRESS=${feeVault}`)
console.log(`RHBP_OFFICIAL_INTEGRATION_REGISTRY_ADDRESS=${officialRegistry}`)
console.log('\nFrontend public config:')
console.log(`registry: ${registry}`)
console.log(`feeVault: ${feeVault}`)
console.log(`officialIntegrationRegistry: ${officialRegistry}`)

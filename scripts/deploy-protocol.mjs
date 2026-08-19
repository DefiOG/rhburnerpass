import fs from 'node:fs'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const networkArg = process.argv.find((arg) => arg.startsWith('--network='))?.split('=')[1]
const network = networkArg || process.env.RHBP_DEPLOY_NETWORK
if (network !== 'testnet' && network !== 'mainnet') {
  throw new Error(
    'Choose an explicit deployment network: --network=testnet or --network=mainnet. ' +
      'Refusing to guess a chain for protocol deployment.',
  )
}

const isMainnet = network === 'mainnet'
const key = process.env.DEPLOYER_PRIVATE_KEY
const treasury = process.env.TREASURY_ADDRESS
const configuredOwner = process.env.PROTOCOL_OWNER_ADDRESS

if (!key) throw new Error('Set DEPLOYER_PRIVATE_KEY in your local environment. Never commit a private key.')
if (!treasury || !isAddress(treasury)) throw new Error('Set a valid TREASURY_ADDRESS in your local environment.')

const defaultTestnetRpc = 'https://rpc.testnet.chain.robinhood.com'
const rpc = process.env.RH_RPC_URL || (isMainnet ? undefined : defaultTestnetRpc)
if (!rpc) {
  throw new Error(
    'RH_RPC_URL is required for mainnet. Use an explicit Robinhood Chain mainnet RPC/provider endpoint.',
  )
}

if (isMainnet && /testnet/i.test(rpc)) {
  throw new Error('RH_RPC_URL appears to be a testnet endpoint. Refusing mainnet deployment.')
}
if (!isMainnet && /mainnet/i.test(rpc)) {
  throw new Error('RH_RPC_URL appears to be a mainnet endpoint. Refusing testnet deployment.')
}

const networkConfig = isMainnet
  ? {
      id: 4663,
      name: 'Robinhood Chain',
      explorer: 'https://robinhoodchain.blockscout.com',
    }
  : {
      id: 46630,
      name: 'Robinhood Chain Testnet',
      explorer: 'https://explorer.testnet.chain.robinhood.com',
    }

const chain = defineChain({
  id: networkConfig.id,
  name: networkConfig.name,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
})

const account = privateKeyToAccount(key)
const protocolOwner = configuredOwner || (isMainnet ? undefined : account.address)
if (!protocolOwner || !isAddress(protocolOwner)) {
  throw new Error(
    isMainnet
      ? 'PROTOCOL_OWNER_ADDRESS is required for mainnet and must be a valid contract-controlled owner address (multisig recommended).'
      : 'PROTOCOL_OWNER_ADDRESS must be a valid address when provided.',
  )
}

if (isMainnet) {
  if (process.env.CONFIRM_MAINNET_DEPLOY !== 'RHBURNERPASS_MAINNET') {
    throw new Error(
      'Mainnet deployment is locked. Set CONFIRM_MAINNET_DEPLOY=RHBURNERPASS_MAINNET only when you intentionally mean to deploy production contracts.',
    )
  }
  if (protocolOwner.toLowerCase() === account.address.toLowerCase()) {
    throw new Error('Mainnet PROTOCOL_OWNER_ADDRESS must not be the deployer EOA. Use a multisig/contract-controlled owner.')
  }
  if (treasury.toLowerCase() === account.address.toLowerCase()) {
    throw new Error('Mainnet TREASURY_ADDRESS must not be the deployer EOA. Use a dedicated multisig/contract-controlled treasury.')
  }
}

const wallet = createWalletClient({ account, chain, transport: http(rpc) })
const publicClient = createPublicClient({ chain, transport: http(rpc) })

const connectedChainId = await publicClient.getChainId()
if (connectedChainId !== networkConfig.id) {
  throw new Error(
    `RPC chain mismatch. Expected ${networkConfig.id} (${networkConfig.name}) but RPC reported ${connectedChainId}.`,
  )
}

if (isMainnet) {
  const [ownerCode, treasuryCode] = await Promise.all([
    publicClient.getBytecode({ address: protocolOwner }),
    publicClient.getBytecode({ address: treasury }),
  ])
  if (!ownerCode || ownerCode === '0x') {
    throw new Error('Mainnet PROTOCOL_OWNER_ADDRESS has no deployed contract code. Use a deployed multisig/contract wallet.')
  }
  if (!treasuryCode || treasuryCode === '0x') {
    throw new Error('Mainnet TREASURY_ADDRESS has no deployed contract code. Use a deployed multisig/contract wallet.')
  }
}

function artifact(name) {
  return JSON.parse(fs.readFileSync(`artifacts/${name}.json`, 'utf8'))
}

async function deploy(name, args = []) {
  const a = artifact(name)
  const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode, args })
  console.log(`${name} tx: ${hash}`)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`${name} deployment reverted.`)
  if (!receipt.contractAddress) throw new Error(`${name} deployment did not return a contract address.`)
  console.log(`${name}: ${receipt.contractAddress}`)
  return receipt.contractAddress
}

console.log('RHBurnerPass protocol deployment plan')
console.log(`Network: ${networkConfig.name} (chain ID ${networkConfig.id})`)
console.log(`RPC: ${rpc}`)
console.log(`Deployer: ${account.address}`)
console.log(`Immutable fee treasury: ${treasury}`)
console.log(`Official-integration owner: ${protocolOwner}`)
console.log('Protocol fee: exactly 0.00005 ETH per delegated NFT (fixed in FeeVaultV2 bytecode)')
console.log(`Explorer: ${networkConfig.explorer}`)

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
const bindReceipt = await publicClient.waitForTransactionReceipt({ hash: bindHash })
if (bindReceipt.status !== 'success') throw new Error('Canonical Registry bind reverted.')

console.log('\nProtocol configuration:')
console.log(`RHBP_REGISTRY_ADDRESS=${registry}`)
console.log(`RHBP_FEE_VAULT_ADDRESS=${feeVault}`)
console.log(`RHBP_OFFICIAL_INTEGRATION_REGISTRY_ADDRESS=${officialRegistry}`)
console.log('\nFrontend public config:')
console.log(`registry: ${registry}`)
console.log(`feeVault: ${feeVault}`)
console.log(`officialIntegrationRegistry: ${officialRegistry}`)
console.log('\nDeployment complete. Save the addresses and transaction hashes before changing any frontend config.')

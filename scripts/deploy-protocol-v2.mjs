import fs from 'node:fs'
import { createPublicClient, createWalletClient, defineChain, http, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const networkArg = process.argv.find((arg) => arg.startsWith('--network='))?.split('=')[1]
const network = networkArg || process.env.RHBP_DEPLOY_NETWORK
if (network !== 'testnet' && network !== 'mainnet') {
  throw new Error('Choose --network=testnet or --network=mainnet. Refusing to guess.')
}
const isMainnet = network === 'mainnet'
const key = process.env.DEPLOYER_PRIVATE_KEY
const treasury = process.env.TREASURY_ADDRESS
const owner = process.env.PROTOCOL_OWNER_ADDRESS
if (!key) throw new Error('Set DEPLOYER_PRIVATE_KEY locally. Never commit it.')
if (!treasury || !isAddress(treasury)) throw new Error('Set a valid TREASURY_ADDRESS.')
if (!owner || !isAddress(owner)) throw new Error('Set a valid PROTOCOL_OWNER_ADDRESS.')

const rpc = process.env.RH_RPC_URL || (isMainnet ? undefined : 'https://rpc.testnet.chain.robinhood.com')
if (!rpc) throw new Error('RH_RPC_URL is required for mainnet.')
if (isMainnet && /testnet/i.test(rpc)) throw new Error('RPC looks like testnet; refusing mainnet deployment.')
if (!isMainnet && /mainnet/i.test(rpc)) throw new Error('RPC looks like mainnet; refusing testnet deployment.')
if (isMainnet && process.env.CONFIRM_RHBP_V2_MAINNET !== 'RHBURNERPASS_V2_MAINNET') {
  throw new Error('Mainnet locked. Set CONFIRM_RHBP_V2_MAINNET=RHBURNERPASS_V2_MAINNET intentionally.')
}

const config = isMainnet
  ? { id: 4663, name: 'Robinhood Chain', explorer: 'https://robinhoodchain.blockscout.com' }
  : { id: 46630, name: 'Robinhood Chain Testnet', explorer: 'https://explorer.testnet.chain.robinhood.com' }
const chain = defineChain({ id: config.id, name: config.name, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } })
const account = privateKeyToAccount(key)
const wallet = createWalletClient({ account, chain, transport: http(rpc) })
const publicClient = createPublicClient({ chain, transport: http(rpc) })
if (await publicClient.getChainId() !== config.id) throw new Error(`RPC chain mismatch; expected ${config.id}.`)
if (isMainnet) {
  if (owner.toLowerCase() === account.address.toLowerCase() || treasury.toLowerCase() === account.address.toLowerCase()) {
    throw new Error('Mainnet owner/treasury must not be the deployer EOA.')
  }
  const [ownerCode, treasuryCode] = await Promise.all([publicClient.getBytecode({ address: owner }), publicClient.getBytecode({ address: treasury })])
  if (!ownerCode || ownerCode === '0x' || !treasuryCode || treasuryCode === '0x') throw new Error('Mainnet owner and treasury must be deployed contract wallets/multisigs.')
}

const artifact = (name) => JSON.parse(fs.readFileSync(`artifacts/${name}.json`, 'utf8'))
async function deploy(name, args) {
  const a = artifact(name)
  const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode, args })
  console.log(`${name} tx: ${hash}`)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error(`${name} deployment failed.`)
  console.log(`${name}: ${receipt.contractAddress}`)
  return receipt.contractAddress
}

console.log('\nRHBurnerPass v2 protocol deployment')
console.log(`Network: ${config.name} (${config.id})`)
console.log(`Deployer: ${account.address}`)
console.log(`Treasury: ${treasury}`)
console.log(`Protocol owner: ${owner}`)
console.log('Delegated fee: fixed 0.00005 ETH/NFT; 90% protocol / 10% integration partner')

const factory = await deploy('RHBurnerPassFactoryV2', [owner])
const feeVault = await deploy('RHBurnerPassFeeVaultV3', [treasury, factory])
const registry = await deploy('RHBurnerPassRegistryV3', [factory])
const f = artifact('RHBurnerPassFactoryV2')
const bindHash = await wallet.writeContract({ account, address: factory, abi: f.abi, functionName: 'bindProtocol', args: [registry, feeVault] })
console.log(`Factory bind tx: ${bindHash}`)
const bindReceipt = await publicClient.waitForTransactionReceipt({ hash: bindHash })
if (bindReceipt.status !== 'success') throw new Error('Factory protocol bind reverted.')

console.log('\nSAVE THESE VALUES:')
console.log(`RHBP_V2_FACTORY_ADDRESS=${factory}`)
console.log(`RHBP_V2_REGISTRY_ADDRESS=${registry}`)
console.log(`RHBP_V2_FEE_VAULT_ADDRESS=${feeVault}`)
console.log(`Explorer: ${config.explorer}`)
console.log('\nNo mint is deployed automatically. Developers create canonical mints through the Factory.')

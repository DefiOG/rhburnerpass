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
if (!key) throw new Error('Set DEPLOYER_PRIVATE_KEY in your local .env.')

const config = JSON.parse(fs.readFileSync('public/config.json', 'utf8'))
const officialRegistry = process.env.RHBP_OFFICIAL_INTEGRATION_REGISTRY_ADDRESS || config.contracts?.officialIntegrationRegistry
const target = process.argv[2] || process.env.TARGET_MINT_ADDRESS || config.contracts?.demoMint
if (!isAddress(officialRegistry)) throw new Error('Official integration registry address is missing. Run npm run deploy:official-registry first.')
if (!isAddress(target)) throw new Error('Target mint address is missing or invalid.')

const chain = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
})
const account = privateKeyToAccount(key)
const wallet = createWalletClient({ account, chain, transport: http(rpc) })
const publicClient = createPublicClient({ chain, transport: http(rpc) })
const artifact = JSON.parse(fs.readFileSync('artifacts/RHBurnerPassOfficialIntegrationRegistry.json', 'utf8'))

const bytecode = await publicClient.getBytecode({ address: target })
if (!bytecode || bytecode === '0x') throw new Error('Target has no deployed bytecode.')
const codeHash = keccak256(bytecode)
const owner = await publicClient.readContract({
  address: officialRegistry,
  abi: artifact.abi,
  functionName: 'owner',
})

console.log(`Target: ${target}`)
console.log(`Runtime code hash: ${codeHash}`)
console.log(`Official registry owner: ${owner}`)

if (owner.toLowerCase() !== account.address.toLowerCase()) {
  const data = encodeFunctionData({
    abi: artifact.abi,
    functionName: 'approveIntegration',
    args: [target, codeHash],
  })
  console.log('\nThe deployer is not the protocol owner. Submit this transaction from the owner/multisig:')
  console.log(`To: ${officialRegistry}`)
  console.log(`Data: ${data}`)
  process.exit(0)
}

const hash = await wallet.writeContract({
  account,
  address: officialRegistry,
  abi: artifact.abi,
  functionName: 'approveIntegration',
  args: [target, codeHash],
})
console.log(`Approval tx: ${hash}`)
const receipt = await publicClient.waitForTransactionReceipt({ hash })
if (receipt.status !== 'success') throw new Error('Approval transaction reverted.')
const official = await publicClient.readContract({
  address: officialRegistry,
  abi: artifact.abi,
  functionName: 'isOfficialIntegration',
  args: [target],
})
console.log(`Official integration: ${official}`)

import Safe from '@safe-global/protocol-kit'
import {
  createPublicClient,
  defineChain,
  formatEther,
  getAddress,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const EXPECTED_CHAIN_ID = 4663
const EXPECTED_DEPLOYER = getAddress('0x42A6ED4FEfffc4D0f12312453e6E36d42A1Eb16B')
const EXPECTED_SAFE = getAddress('0xA70bDD510A6D339318FdBCaFb60862FDD39AbA0b')

const rpc = process.env.RH_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'
const key = process.env.DEPLOYER_PRIVATE_KEY

if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  throw new Error('DEPLOYER_PRIVATE_KEY is missing or malformed in .env.mainnet.')
}

const owners = [
  getAddress(process.env.SAFE_OWNER_1 || ''),
  getAddress(process.env.SAFE_OWNER_2 || ''),
  getAddress(process.env.SAFE_OWNER_3 || ''),
]
const threshold = Number(process.env.SAFE_THRESHOLD)

if (threshold !== 2 || new Set(owners.map((x) => x.toLowerCase())).size !== 3) {
  throw new Error('Safe configuration must be exactly 3 distinct owners with threshold 2.')
}

const account = privateKeyToAccount(key)
if (getAddress(account.address) !== EXPECTED_DEPLOYER) {
  throw new Error(
    `Deployer mismatch. Expected ${EXPECTED_DEPLOYER}, got ${account.address}. Nothing was sent.`
  )
}

const chain = defineChain({
  id: EXPECTED_CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
})

const publicClient = createPublicClient({ chain, transport: http(rpc) })

const liveChainId = await publicClient.getChainId()
if (liveChainId !== EXPECTED_CHAIN_ID) {
  throw new Error(
    `RPC chain mismatch. Expected ${EXPECTED_CHAIN_ID}, got ${liveChainId}. Nothing was sent.`
  )
}

const protocolKit = await Safe.init({
  provider: rpc,
  signer: owners[0],
  predictedSafe: {
    safeAccountConfig: { owners, threshold },
    safeDeploymentConfig: { saltNonce: '4663' },
  },
})

const predictedSafe = getAddress(await protocolKit.getAddress())
if (predictedSafe !== EXPECTED_SAFE) {
  throw new Error(
    `Predicted Safe changed. Expected ${EXPECTED_SAFE}, got ${predictedSafe}. Nothing was sent.`
  )
}

const existingCode = await publicClient.getBytecode({ address: predictedSafe })
if (existingCode && existingCode !== '0x') {
  throw new Error(`Safe ${predictedSafe} is already deployed. Nothing was sent.`)
}

const tx = await protocolKit.createSafeDeploymentTransaction()
const gas = await publicClient.estimateGas({
  account: account.address,
  to: getAddress(tx.to),
  data: tx.data,
  value: BigInt(tx.value),
})

const fees = await publicClient.estimateFeesPerGas()
const feePerGas =
  fees.maxFeePerGas ??
  fees.gasPrice ??
  0n

const estimatedMaxCost = gas * feePerGas
const recommendedBalance = estimatedMaxCost * 2n
const deployerBalance = await publicClient.getBalance({ address: account.address })

console.log('RHBurnerPass Safe MAINNET preflight - READ ONLY')
console.log(`Chain ID verified: ${liveChainId}`)
console.log(`Deployer verified: ${account.address}`)
console.log(`Predicted Safe verified: ${predictedSafe}`)
console.log(`Owners: ${owners.length}, threshold: ${threshold}`)
console.log(`Already deployed: NO`)
console.log('')
console.log(`Estimated deployment gas: ${gas}`)
console.log(`Estimated max gas cost: ${formatEther(estimatedMaxCost)} ETH`)
console.log(`Suggested deployer balance (2x estimate): ${formatEther(recommendedBalance)} ETH`)
console.log(`Current deployer balance: ${formatEther(deployerBalance)} ETH`)
console.log('')
console.log(
  deployerBalance >= recommendedBalance
    ? 'FUNDING CHECK: sufficient for the suggested buffer.'
    : 'FUNDING CHECK: not yet funded to the suggested buffer.'
)
console.log('')
console.log('READ-ONLY COMPLETE. No transaction was signed or sent.')

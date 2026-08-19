import Safe from '@safe-global/protocol-kit'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  getAddress,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const EXPECTED_CHAIN_ID = 4663
const EXPECTED_DEPLOYER = getAddress('0x42A6ED4FEfffc4D0f12312453e6E36d42A1Eb16B')
const EXPECTED_SAFE = getAddress('0xA70bDD510A6D339318FdBCaFb60862FDD39AbA0b')
const REQUIRED_CONFIRMATION = 'DEPLOY_RHBP_SAFE_4663'

const rpc = process.env.RH_RPC_URL
const key = process.env.DEPLOYER_PRIVATE_KEY
const confirmation = process.env.CONFIRM_SAFE_DEPLOY

if (!rpc) throw new Error('RH_RPC_URL is missing from .env.mainnet.')
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
const walletClient = createWalletClient({ account, chain, transport: http(rpc) })

const liveChainId = await publicClient.getChainId()
if (liveChainId !== EXPECTED_CHAIN_ID) {
  throw new Error(
    `RPC chain mismatch. Expected ${EXPECTED_CHAIN_ID}, got ${liveChainId}. Nothing was sent.`
  )
}

// Generate the deployment transaction without giving Protocol Kit the deployer key.
// Safe deployment itself may be paid by an external EOA that is not a Safe owner.
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

const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction()
const deploymentTo = getAddress(deploymentTransaction.to)
const deploymentValue = BigInt(deploymentTransaction.value)

const gasEstimate = await publicClient.estimateGas({
  account: account.address,
  to: deploymentTo,
  data: deploymentTransaction.data,
  value: deploymentValue,
})
const gasLimit = (gasEstimate * 120n) / 100n
const fees = await publicClient.estimateFeesPerGas()
const feePerGas = fees.maxFeePerGas ?? fees.gasPrice ?? 0n
const estimatedBufferedCost = gasLimit * feePerGas
const balance = await publicClient.getBalance({ address: account.address })

console.log('RHBurnerPass Safe MAINNET deployment check')
console.log(`Chain ID: ${liveChainId}`)
console.log(`Deployer: ${account.address}`)
console.log(`Safe: ${predictedSafe}`)
console.log(`Owners: ${owners.length}`)
console.log(`Threshold: ${threshold} of ${owners.length}`)
console.log(`Factory: ${deploymentTo}`)
console.log(`Gas estimate: ${gasEstimate}`)
console.log(`Gas limit with 20% buffer: ${gasLimit}`)
console.log(`Estimated buffered gas cost: ${formatEther(estimatedBufferedCost)} ETH`)
console.log(`Deployer balance: ${formatEther(balance)} ETH`)
console.log('')

if (balance < estimatedBufferedCost) {
  throw new Error('Deployer balance is below the buffered gas estimate. Nothing was sent.')
}

if (confirmation !== REQUIRED_CONFIRMATION) {
  console.log('SAFETY LOCK ACTIVE. No transaction was sent.')
  console.log(`To deploy, set CONFIRM_SAFE_DEPLOY=${REQUIRED_CONFIRMATION} in .env.mainnet and rerun.`)
  process.exit(0)
}

console.log('Safety lock accepted. Sending Safe deployment transaction...')

const hash = await walletClient.sendTransaction({
  account,
  to: deploymentTo,
  data: deploymentTransaction.data,
  value: deploymentValue,
  gas: gasLimit,
})

console.log(`Deployment tx: ${hash}`)
const receipt = await publicClient.waitForTransactionReceipt({ hash })

if (receipt.status !== 'success') {
  throw new Error(`Safe deployment transaction reverted: ${hash}`)
}

const deployedCode = await publicClient.getBytecode({ address: predictedSafe })
if (!deployedCode || deployedCode === '0x') {
  throw new Error('Transaction succeeded but no code was found at the predicted Safe address.')
}

const deployedKit = await Safe.init({
  provider: rpc,
  signer: owners[0],
  safeAddress: predictedSafe,
})

const onchainOwners = (await deployedKit.getOwners()).map(getAddress)
const onchainThreshold = await deployedKit.getThreshold()

const expectedOwnerSet = new Set(owners.map((x) => x.toLowerCase()))
const onchainOwnerSet = new Set(onchainOwners.map((x) => x.toLowerCase()))
const ownersMatch =
  expectedOwnerSet.size === onchainOwnerSet.size &&
  [...expectedOwnerSet].every((x) => onchainOwnerSet.has(x))

if (!ownersMatch) {
  throw new Error(`Safe deployed, but on-chain owners do not match expected owners. Tx: ${hash}`)
}
if (Number(onchainThreshold) !== threshold) {
  throw new Error(
    `Safe deployed, but threshold is ${onchainThreshold}, expected ${threshold}. Tx: ${hash}`
  )
}

console.log('')
console.log('SAFE DEPLOYMENT VERIFIED')
console.log(`Safe address: ${predictedSafe}`)
console.log(`Threshold: ${onchainThreshold} of ${onchainOwners.length}`)
console.log('Owners:')
onchainOwners.forEach((owner, index) => console.log(`  ${index + 1}. ${owner}`))
console.log(`Transaction: ${hash}`)
console.log('')
console.log('Next: clear CONFIRM_SAFE_DEPLOY in .env.mainnet before doing anything else.')

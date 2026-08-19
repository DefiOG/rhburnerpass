import fs from 'node:fs'
import {
  createPublicClient,
  defineChain,
  encodeDeployData,
  formatEther,
  getAddress,
  getContractAddress,
  http,
  isAddress,
  parseAbi,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const CHAIN_ID = 4663
const EXPECTED_DEPLOYER = getAddress('0x42A6ED4FEfffc4D0f12312453e6E36d42A1Eb16B')
const EXPECTED_SAFE = getAddress('0xA70bDD510A6D339318FdBCaFb60862FDD39AbA0b')
const EXPECTED_FEE_WEI = 50_000_000_000_000n // 0.00005 ETH

const rpc = process.env.RH_RPC_URL
const key = process.env.DEPLOYER_PRIVATE_KEY
const treasury = process.env.TREASURY_ADDRESS
const owner = process.env.PROTOCOL_OWNER_ADDRESS

if (!rpc) throw new Error('RH_RPC_URL is missing.')
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  throw new Error('DEPLOYER_PRIVATE_KEY is missing or malformed.')
}
if (!treasury || !isAddress(treasury)) throw new Error('TREASURY_ADDRESS is missing or invalid.')
if (!owner || !isAddress(owner)) throw new Error('PROTOCOL_OWNER_ADDRESS is missing or invalid.')

if (process.env.CONFIRM_MAINNET_DEPLOY) {
  throw new Error('CONFIRM_MAINNET_DEPLOY must be blank during this read-only preflight.')
}
if (process.env.CONFIRM_SAFE_DEPLOY) {
  throw new Error('CONFIRM_SAFE_DEPLOY must be blank during this read-only preflight.')
}
if (process.env.CONFIRM_SAFE_TEST_EXEC) {
  throw new Error('CONFIRM_SAFE_TEST_EXEC must be blank during this read-only preflight.')
}

const account = privateKeyToAccount(key)
if (getAddress(account.address) !== EXPECTED_DEPLOYER) {
  throw new Error(`Unexpected deployer. Expected ${EXPECTED_DEPLOYER}, got ${account.address}.`)
}
if (getAddress(treasury) !== EXPECTED_SAFE) {
  throw new Error(`TREASURY_ADDRESS must be the verified Safe ${EXPECTED_SAFE}.`)
}
if (getAddress(owner) !== EXPECTED_SAFE) {
  throw new Error(`PROTOCOL_OWNER_ADDRESS must be the verified Safe ${EXPECTED_SAFE}.`)
}

const chain = defineChain({
  id: CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
})

const publicClient = createPublicClient({ chain, transport: http(rpc) })

const liveChainId = await publicClient.getChainId()
if (liveChainId !== CHAIN_ID) {
  throw new Error(`RPC chain mismatch. Expected ${CHAIN_ID}, got ${liveChainId}.`)
}

const safeCode = await publicClient.getBytecode({ address: EXPECTED_SAFE })
if (!safeCode || safeCode === '0x') {
  throw new Error(`Verified Safe ${EXPECTED_SAFE} has no deployed code.`)
}

const safeAbi = parseAbi([
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
  'function nonce() view returns (uint256)',
])

const [safeOwners, safeThreshold, safeNonce] = await Promise.all([
  publicClient.readContract({ address: EXPECTED_SAFE, abi: safeAbi, functionName: 'getOwners' }),
  publicClient.readContract({ address: EXPECTED_SAFE, abi: safeAbi, functionName: 'getThreshold' }),
  publicClient.readContract({ address: EXPECTED_SAFE, abi: safeAbi, functionName: 'nonce' }),
])

const expectedOwners = new Set([
  '0xeec6244d9fbce601ce824a9594238e9c9b3770be',
  '0x2966c9bb3ef150db20387f3ed5ab15dd2a7b2f29',
  '0x980ea39f124fdc7c79e7975280c1cc8bf352c5c5',
])
const actualOwners = new Set(safeOwners.map((x) => x.toLowerCase()))
if (
  actualOwners.size !== expectedOwners.size ||
  [...expectedOwners].some((x) => !actualOwners.has(x))
) {
  throw new Error('Safe owners no longer match the verified 3-owner set.')
}
if (safeThreshold !== 2n) throw new Error(`Safe threshold changed. Expected 2, got ${safeThreshold}.`)
if (safeNonce < 1n) throw new Error(`Safe nonce is ${safeNonce}; expected at least 1 after the control test.`)

function artifact(name) {
  const path = `artifacts/${name}.json`
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}. Run the project compile step first.`)
  const parsed = JSON.parse(fs.readFileSync(path, 'utf8'))
  if (!parsed.abi || !parsed.bytecode || parsed.bytecode === '0x') {
    throw new Error(`Artifact ${path} is incomplete.`)
  }
  return parsed
}

const feeArtifact = artifact('RHBurnerPassFeeVaultV2')
const officialArtifact = artifact('RHBurnerPassOfficialIntegrationRegistry')
const registryArtifact = artifact('RHBurnerPassRegistryV2')

const feeGetter = feeArtifact.abi.find(
  (x) => x.type === 'function' && x.name === 'FEE_PER_NFT' && x.stateMutability === 'view',
)
if (!feeGetter) {
  throw new Error('FeeVaultV2 artifact does not expose FEE_PER_NFT(). Refusing preflight.')
}

const deployerNonce = await publicClient.getTransactionCount({
  address: account.address,
  blockTag: 'pending',
})

const feeVaultPredicted = getContractAddress({
  from: account.address,
  nonce: BigInt(deployerNonce),
})
const officialPredicted = getContractAddress({
  from: account.address,
  nonce: BigInt(deployerNonce + 1),
})
const registryPredicted = getContractAddress({
  from: account.address,
  nonce: BigInt(deployerNonce + 2),
})

const feeData = encodeDeployData({
  abi: feeArtifact.abi,
  bytecode: feeArtifact.bytecode,
  args: [EXPECTED_SAFE],
})
const officialData = encodeDeployData({
  abi: officialArtifact.abi,
  bytecode: officialArtifact.bytecode,
  args: [EXPECTED_SAFE, feeVaultPredicted],
})
const registryData = encodeDeployData({
  abi: registryArtifact.abi,
  bytecode: registryArtifact.bytecode,
  args: [officialPredicted],
})

async function estimateCreation(data) {
  return publicClient.estimateGas({
    account: account.address,
    data,
  })
}

const [feeGas, officialGas, registryGas, fees, balance] = await Promise.all([
  estimateCreation(feeData),
  estimateCreation(officialData),
  estimateCreation(registryData),
  publicClient.estimateFeesPerGas(),
  publicClient.getBalance({ address: account.address }),
])

// Bind gas cannot be reliably simulated before the predicted Official Registry exists.
// Use a conservative fixed allowance on top of the three live deployment estimates.
const BIND_GAS_ALLOWANCE = 200_000n
const totalEstimatedGas = feeGas + officialGas + registryGas + BIND_GAS_ALLOWANCE
const bufferedGas = (totalEstimatedGas * 150n) / 100n
const maxFeePerGas = fees.maxFeePerGas ?? fees.gasPrice ?? 0n
const bufferedCost = bufferedGas * maxFeePerGas
const suggestedBalance = bufferedCost * 2n

console.log('RHBurnerPass MAINNET protocol preflight - READ ONLY')
console.log(`Chain ID verified: ${liveChainId}`)
console.log(`Deployer verified: ${account.address}`)
console.log(`Treasury / protocol owner Safe verified: ${EXPECTED_SAFE}`)
console.log(`Safe owners: ${safeOwners.length}, threshold: ${safeThreshold}, nonce: ${safeNonce}`)
console.log('All deployment safety locks: BLANK')
console.log('')
console.log(`Current deployer pending nonce: ${deployerNonce}`)
console.log('Predicted CREATE addresses if the deployer sends no other transactions first:')
console.log(`  FeeVaultV2: ${feeVaultPredicted}`)
console.log(`  OfficialIntegrationRegistry: ${officialPredicted}`)
console.log(`  RegistryV2: ${registryPredicted}`)
console.log('')
console.log(`FeeVaultV2 deployment gas estimate: ${feeGas}`)
console.log(`Official Registry deployment gas estimate: ${officialGas}`)
console.log(`RegistryV2 deployment gas estimate: ${registryGas}`)
console.log(`Bind allowance: ${BIND_GAS_ALLOWANCE}`)
console.log(`Total gas estimate + bind allowance: ${totalEstimatedGas}`)
console.log(`Buffered gas budget (1.5x): ${bufferedGas}`)
console.log(`Estimated buffered max gas cost: ${formatEther(bufferedCost)} ETH`)
console.log(`Suggested deployer balance (2x buffered cost): ${formatEther(suggestedBalance)} ETH`)
console.log(`Current deployer balance: ${formatEther(balance)} ETH`)
console.log('')
console.log(`Protocol fee invariant expected after deployment: ${EXPECTED_FEE_WEI} wei = 0.00005 ETH`)
console.log('')
if (balance >= suggestedBalance) {
  console.log('FUNDING CHECK: sufficient for the suggested buffer.')
} else if (balance >= bufferedCost) {
  console.log('FUNDING CHECK: enough for the buffered estimate, but below the preferred 2x safety balance.')
} else {
  console.log('FUNDING CHECK: insufficient for the buffered deployment estimate.')
}
console.log('')
console.log('READ-ONLY COMPLETE. No transaction was signed or sent.')
console.log('IMPORTANT: predicted addresses depend on the deployer nonce. Do not use the deployer wallet for any other transaction before production deployment.')

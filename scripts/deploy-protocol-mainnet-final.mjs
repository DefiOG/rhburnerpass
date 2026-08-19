import fs from 'node:fs'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeDeployData,
  formatEther,
  getAddress,
  getContractAddress,
  http,
  isAddress,
  zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const CHAIN_ID = 4663
const REQUIRED_CONFIRMATION = 'RHBURNERPASS_MAINNET'

const EXPECTED_DEPLOYER = getAddress('0x42A6ED4FEfffc4D0f12312453e6E36d42A1Eb16B')
const EXPECTED_SAFE = getAddress('0xA70bDD510A6D339318FdBCaFb60862FDD39AbA0b')
const EXPECTED_START_NONCE = 2

const EXPECTED_FEE_VAULT = getAddress('0xd3e873CCE414a0a24F9E888236faCe40ab6C02DA')
const EXPECTED_OFFICIAL_REGISTRY = getAddress('0xb8d1f6F919B5A19B1EA1036f2358f21184f4C282')
const EXPECTED_REGISTRY = getAddress('0xA6D25fD2214C6c136599F65bDc07DE77A5f67d6e')
const EXPECTED_FEE_PER_NFT = 50_000_000_000_000n // 0.00005 ETH

const rpc = process.env.RH_RPC_URL
const key = process.env.DEPLOYER_PRIVATE_KEY
const treasury = process.env.TREASURY_ADDRESS
const protocolOwner = process.env.PROTOCOL_OWNER_ADDRESS

if (!rpc) throw new Error('RH_RPC_URL is missing.')
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  throw new Error('DEPLOYER_PRIVATE_KEY is missing or malformed.')
}
if (!treasury || !isAddress(treasury)) throw new Error('TREASURY_ADDRESS is missing or invalid.')
if (!protocolOwner || !isAddress(protocolOwner)) throw new Error('PROTOCOL_OWNER_ADDRESS is missing or invalid.')

if (process.env.CONFIRM_SAFE_DEPLOY) {
  throw new Error('CONFIRM_SAFE_DEPLOY must be blank before protocol deployment.')
}
if (process.env.CONFIRM_SAFE_TEST_EXEC) {
  throw new Error('CONFIRM_SAFE_TEST_EXEC must be blank before protocol deployment.')
}

const account = privateKeyToAccount(key)
if (getAddress(account.address) !== EXPECTED_DEPLOYER) {
  throw new Error(`Unexpected deployer. Expected ${EXPECTED_DEPLOYER}, got ${account.address}.`)
}
if (getAddress(treasury) !== EXPECTED_SAFE) {
  throw new Error(`TREASURY_ADDRESS must equal verified Safe ${EXPECTED_SAFE}.`)
}
if (getAddress(protocolOwner) !== EXPECTED_SAFE) {
  throw new Error(`PROTOCOL_OWNER_ADDRESS must equal verified Safe ${EXPECTED_SAFE}.`)
}

const chain = defineChain({
  id: CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
})

const publicClient = createPublicClient({ chain, transport: http(rpc) })
const walletClient = createWalletClient({ account, chain, transport: http(rpc) })

const liveChainId = await publicClient.getChainId()
if (liveChainId !== CHAIN_ID) {
  throw new Error(`RPC chain mismatch. Expected ${CHAIN_ID}, got ${liveChainId}.`)
}

const [safeCode, deployerNonce, balance] = await Promise.all([
  publicClient.getBytecode({ address: EXPECTED_SAFE }),
  publicClient.getTransactionCount({ address: EXPECTED_DEPLOYER, blockTag: 'pending' }),
  publicClient.getBalance({ address: EXPECTED_DEPLOYER }),
])

if (!safeCode || safeCode === '0x') throw new Error('Verified Safe has no deployed code.')
if (deployerNonce !== EXPECTED_START_NONCE) {
  throw new Error(
    `Deployer pending nonce changed. Expected ${EXPECTED_START_NONCE}, got ${deployerNonce}. ` +
    'Predicted production addresses are no longer guaranteed. Nothing was sent.',
  )
}

const predictedFee = getContractAddress({ from: EXPECTED_DEPLOYER, nonce: 2n })
const predictedOfficial = getContractAddress({ from: EXPECTED_DEPLOYER, nonce: 3n })
const predictedRegistry = getContractAddress({ from: EXPECTED_DEPLOYER, nonce: 4n })

if (predictedFee !== EXPECTED_FEE_VAULT) throw new Error('FeeVaultV2 predicted address mismatch.')
if (predictedOfficial !== EXPECTED_OFFICIAL_REGISTRY) throw new Error('Official Registry predicted address mismatch.')
if (predictedRegistry !== EXPECTED_REGISTRY) throw new Error('RegistryV2 predicted address mismatch.')

for (const address of [EXPECTED_FEE_VAULT, EXPECTED_OFFICIAL_REGISTRY, EXPECTED_REGISTRY]) {
  const code = await publicClient.getBytecode({ address })
  if (code && code !== '0x') {
    throw new Error(`Expected production address ${address} already contains code. Nothing was sent.`)
  }
}

function artifact(name) {
  const path = `artifacts/${name}.json`
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}. Run .\\VERIFY_HARDENING.cmd first.`)
  const a = JSON.parse(fs.readFileSync(path, 'utf8'))
  if (!a.abi || !a.bytecode || a.bytecode === '0x') throw new Error(`Invalid artifact ${path}.`)
  return a
}

const feeArtifact = artifact('RHBurnerPassFeeVaultV2')
const officialArtifact = artifact('RHBurnerPassOfficialIntegrationRegistry')
const registryArtifact = artifact('RHBurnerPassRegistryV2')

const feeDeployData = encodeDeployData({
  abi: feeArtifact.abi,
  bytecode: feeArtifact.bytecode,
  args: [EXPECTED_SAFE],
})
const officialDeployData = encodeDeployData({
  abi: officialArtifact.abi,
  bytecode: officialArtifact.bytecode,
  args: [EXPECTED_SAFE, EXPECTED_FEE_VAULT],
})
const registryDeployData = encodeDeployData({
  abi: registryArtifact.abi,
  bytecode: registryArtifact.bytecode,
  args: [EXPECTED_OFFICIAL_REGISTRY],
})

const [feeGas, officialGas, registryGas, fees] = await Promise.all([
  publicClient.estimateGas({ account: EXPECTED_DEPLOYER, data: feeDeployData }),
  publicClient.estimateGas({ account: EXPECTED_DEPLOYER, data: officialDeployData }),
  publicClient.estimateGas({ account: EXPECTED_DEPLOYER, data: registryDeployData }),
  publicClient.estimateFeesPerGas(),
])

const BIND_ALLOWANCE = 200_000n
const totalEstimatedGas = feeGas + officialGas + registryGas + BIND_ALLOWANCE
const bufferedGas = (totalEstimatedGas * 150n) / 100n
const maxFeePerGas = fees.maxFeePerGas ?? fees.gasPrice ?? 0n
const bufferedCost = bufferedGas * maxFeePerGas
const requiredBalance = bufferedCost * 2n

console.log('RHBurnerPass FINAL MAINNET deployment gate')
console.log(`Chain ID: ${liveChainId}`)
console.log(`Deployer: ${EXPECTED_DEPLOYER}`)
console.log(`Deployer pending nonce: ${deployerNonce}`)
console.log(`Deployer balance: ${formatEther(balance)} ETH`)
console.log(`Preferred minimum balance right now: ${formatEther(requiredBalance)} ETH`)
console.log(`Treasury / protocol owner Safe: ${EXPECTED_SAFE}`)
console.log('')
console.log('Locked production addresses:')
console.log(`  FeeVaultV2: ${EXPECTED_FEE_VAULT}`)
console.log(`  OfficialIntegrationRegistry: ${EXPECTED_OFFICIAL_REGISTRY}`)
console.log(`  RegistryV2: ${EXPECTED_REGISTRY}`)
console.log('')
console.log(`Fixed delegated protocol fee: ${formatEther(EXPECTED_FEE_PER_NFT)} ETH per NFT`)
console.log(`Estimated gas: ${totalEstimatedGas}`)
console.log(`Buffered gas estimate: ${bufferedGas}`)
console.log('')

if (balance < requiredBalance) {
  throw new Error(
    `Deployer balance ${formatEther(balance)} ETH is below the current preferred 2x safety balance ` +
    `${formatEther(requiredBalance)} ETH. Nothing was sent.`,
  )
}

if (process.env.CONFIRM_MAINNET_DEPLOY !== REQUIRED_CONFIRMATION) {
  console.log('MAINNET SAFETY LOCK ACTIVE. No transaction was signed or sent.')
  console.log(`To deploy production, set CONFIRM_MAINNET_DEPLOY=${REQUIRED_CONFIRMATION} and rerun this exact script.`)
  process.exit(0)
}

async function deployExact(name, artifactData, args, nonce, expectedAddress) {
  console.log(`Deploying ${name} at expected address ${expectedAddress}...`)
  const hash = await walletClient.deployContract({
    account,
    abi: artifactData.abi,
    bytecode: artifactData.bytecode,
    args,
    nonce,
  })
  console.log(`${name} tx: ${hash}`)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`${name} deployment reverted. Tx: ${hash}`)
  if (!receipt.contractAddress) throw new Error(`${name} receipt has no contract address. Tx: ${hash}`)
  if (getAddress(receipt.contractAddress) !== expectedAddress) {
    throw new Error(
      `${name} deployed to unexpected address ${receipt.contractAddress}; expected ${expectedAddress}. Tx: ${hash}`,
    )
  }
  const code = await publicClient.getBytecode({ address: expectedAddress })
  if (!code || code === '0x') throw new Error(`${name} receipt succeeded but deployed code is not yet readable.`)
  return hash
}

console.log('MAINNET SAFETY LOCK ACCEPTED.')
console.log('Beginning production deployment. Do not use the deployer wallet elsewhere until this finishes.')
console.log('')

const feeTx = await deployExact(
  'RHBurnerPassFeeVaultV2',
  feeArtifact,
  [EXPECTED_SAFE],
  2,
  EXPECTED_FEE_VAULT,
)

const [feeConstant, feeTreasury, quoteOne] = await Promise.all([
  publicClient.readContract({
    address: EXPECTED_FEE_VAULT,
    abi: feeArtifact.abi,
    functionName: 'FEE_PER_NFT',
  }),
  publicClient.readContract({
    address: EXPECTED_FEE_VAULT,
    abi: feeArtifact.abi,
    functionName: 'treasury',
  }),
  publicClient.readContract({
    address: EXPECTED_FEE_VAULT,
    abi: feeArtifact.abi,
    functionName: 'quote',
    args: [1n],
  }),
])

if (feeConstant !== EXPECTED_FEE_PER_NFT || quoteOne !== EXPECTED_FEE_PER_NFT) {
  throw new Error('FeeVaultV2 deployed but fixed fee invariant is wrong. STOP.')
}
if (getAddress(feeTreasury) !== EXPECTED_SAFE) {
  throw new Error('FeeVaultV2 deployed but immutable treasury is not the verified Safe. STOP.')
}
console.log('FeeVaultV2 post-deploy invariants: VERIFIED')
console.log('')

const officialTx = await deployExact(
  'RHBurnerPassOfficialIntegrationRegistry',
  officialArtifact,
  [EXPECTED_SAFE, EXPECTED_FEE_VAULT],
  3,
  EXPECTED_OFFICIAL_REGISTRY,
)

const [officialOwner, bootstrapper, canonicalFeeVault, canonicalBefore] = await Promise.all([
  publicClient.readContract({
    address: EXPECTED_OFFICIAL_REGISTRY,
    abi: officialArtifact.abi,
    functionName: 'owner',
  }),
  publicClient.readContract({
    address: EXPECTED_OFFICIAL_REGISTRY,
    abi: officialArtifact.abi,
    functionName: 'bootstrapper',
  }),
  publicClient.readContract({
    address: EXPECTED_OFFICIAL_REGISTRY,
    abi: officialArtifact.abi,
    functionName: 'canonicalFeeVault',
  }),
  publicClient.readContract({
    address: EXPECTED_OFFICIAL_REGISTRY,
    abi: officialArtifact.abi,
    functionName: 'canonicalRegistry',
  }),
])

if (getAddress(officialOwner) !== EXPECTED_SAFE) throw new Error('Official Registry owner invariant failed. STOP.')
if (getAddress(bootstrapper) !== EXPECTED_DEPLOYER) throw new Error('Official Registry bootstrapper invariant failed. STOP.')
if (getAddress(canonicalFeeVault) !== EXPECTED_FEE_VAULT) throw new Error('Official Registry fee vault invariant failed. STOP.')
if (getAddress(canonicalBefore) !== getAddress(zeroAddress)) throw new Error('Official Registry canonicalRegistry should be zero before binding. STOP.')
console.log('OfficialIntegrationRegistry post-deploy invariants: VERIFIED')
console.log('')

const registryTx = await deployExact(
  'RHBurnerPassRegistryV2',
  registryArtifact,
  [EXPECTED_OFFICIAL_REGISTRY],
  4,
  EXPECTED_REGISTRY,
)

const registryOfficial = await publicClient.readContract({
  address: EXPECTED_REGISTRY,
  abi: registryArtifact.abi,
  functionName: 'officialIntegrationRegistry',
})
if (getAddress(registryOfficial) !== EXPECTED_OFFICIAL_REGISTRY) {
  throw new Error('RegistryV2 officialIntegrationRegistry invariant failed. STOP.')
}
console.log('RegistryV2 post-deploy invariant: VERIFIED')
console.log('')

console.log('Binding canonical Registry one time...')
const bindHash = await walletClient.writeContract({
  account,
  address: EXPECTED_OFFICIAL_REGISTRY,
  abi: officialArtifact.abi,
  functionName: 'bindCanonicalRegistry',
  args: [EXPECTED_REGISTRY],
  nonce: 5,
})
console.log(`Bind canonical Registry tx: ${bindHash}`)

const bindReceipt = await publicClient.waitForTransactionReceipt({ hash: bindHash })
if (bindReceipt.status !== 'success') throw new Error(`Canonical Registry bind reverted. Tx: ${bindHash}`)

const canonicalAfter = await publicClient.readContract({
  address: EXPECTED_OFFICIAL_REGISTRY,
  abi: officialArtifact.abi,
  functionName: 'canonicalRegistry',
})
if (getAddress(canonicalAfter) !== EXPECTED_REGISTRY) {
  throw new Error('Canonical Registry bind transaction succeeded but final binding is wrong. STOP.')
}

const finalNonce = await publicClient.getTransactionCount({
  address: EXPECTED_DEPLOYER,
  blockTag: 'pending',
})
if (finalNonce < 6) {
  throw new Error(`Expected deployer nonce to advance through at least 6, got ${finalNonce}.`)
}

console.log('')
console.log('RHBURNERPASS MAINNET PROTOCOL DEPLOYMENT VERIFIED')
console.log('')
console.log(`FeeVaultV2: ${EXPECTED_FEE_VAULT}`)
console.log(`  tx: ${feeTx}`)
console.log(`OfficialIntegrationRegistry: ${EXPECTED_OFFICIAL_REGISTRY}`)
console.log(`  tx: ${officialTx}`)
console.log(`RegistryV2: ${EXPECTED_REGISTRY}`)
console.log(`  tx: ${registryTx}`)
console.log(`Canonical Registry bind tx: ${bindHash}`)
console.log('')
console.log(`Fixed fee: ${formatEther(feeConstant)} ETH per delegated NFT`)
console.log(`Immutable treasury: ${feeTreasury}`)
console.log(`Protocol owner: ${officialOwner}`)
console.log(`Canonical FeeVault: ${canonicalFeeVault}`)
console.log(`Canonical Registry: ${canonicalAfter}`)
console.log('')
console.log('IMPORTANT: immediately clear CONFIRM_MAINNET_DEPLOY in .env.mainnet.')
console.log('Do not approve any production mint integration until its deployed bytecode and bindings have been separately reviewed.')

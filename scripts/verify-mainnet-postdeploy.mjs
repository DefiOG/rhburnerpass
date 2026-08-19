import fs from 'node:fs'
import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  keccak256,
  zeroAddress,
} from 'viem'

const CHAIN_ID = 4663

const SAFE = getAddress('0xA70bDD510A6D339318FdBCaFb60862FDD39AbA0b')
const DEPLOYER = getAddress('0x42A6ED4FEfffc4D0f12312453e6E36d42A1Eb16B')

const FEE_VAULT = getAddress('0xd3e873CCE414a0a24F9E888236faCe40ab6C02DA')
const OFFICIAL = getAddress('0xb8d1f6F919B5A19B1EA1036f2358f21184f4C282')
const REGISTRY = getAddress('0xA6D25fD2214C6c136599F65bDc07DE77A5f67d6e')

const FEE_TX = '0xd82337d2a0117dd91f824c5b86f35da2daa5dbff7c6d2c5f86449f16a565bd95'
const OFFICIAL_TX = '0xd6a326069397086fd3766202da3d705f9c37ec7c9595b88c7e82c2142001c1d8'
const REGISTRY_TX = '0x17eb8ec83cc9d3e40e9bdc16c04428658e371a7e58589b6199c995f681b3d082'
const BIND_TX = '0x4d79acfe74512d8835511966b165e81d68997e4293ae3fa718801d14681c08a6'

const EXPECTED_FEE = 50_000_000_000_000n

const rpc = process.env.RH_RPC_URL
if (!rpc) throw new Error('RH_RPC_URL is missing.')

if (process.env.CONFIRM_MAINNET_DEPLOY) {
  throw new Error('CONFIRM_MAINNET_DEPLOY must be blank for read-only post-deploy verification.')
}
if (process.env.CONFIRM_SAFE_DEPLOY) {
  throw new Error('CONFIRM_SAFE_DEPLOY must be blank for read-only post-deploy verification.')
}
if (process.env.CONFIRM_SAFE_TEST_EXEC) {
  throw new Error('CONFIRM_SAFE_TEST_EXEC must be blank for read-only post-deploy verification.')
}

function artifact(name) {
  const path = `artifacts/${name}.json`
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}.`)
  const a = JSON.parse(fs.readFileSync(path, 'utf8'))
  if (!a.abi) throw new Error(`Artifact ${path} has no ABI.`)
  return a
}

const feeArtifact = artifact('RHBurnerPassFeeVaultV2')
const officialArtifact = artifact('RHBurnerPassOfficialIntegrationRegistry')
const registryArtifact = artifact('RHBurnerPassRegistryV2')

const chain = defineChain({
  id: CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
})

const client = createPublicClient({ chain, transport: http(rpc) })

const liveChainId = await client.getChainId()
if (liveChainId !== CHAIN_ID) {
  throw new Error(`RPC chain mismatch. Expected ${CHAIN_ID}, got ${liveChainId}.`)
}

async function requireCode(address, label) {
  const code = await client.getBytecode({ address })
  if (!code || code === '0x') throw new Error(`${label} has no deployed code at ${address}.`)
  return code
}

const [safeCode, feeCode, officialCode, registryCode] = await Promise.all([
  requireCode(SAFE, 'Safe'),
  requireCode(FEE_VAULT, 'FeeVaultV2'),
  requireCode(OFFICIAL, 'OfficialIntegrationRegistry'),
  requireCode(REGISTRY, 'RegistryV2'),
])

async function requireReceipt(hash, label, expectedContractAddress = null) {
  const receipt = await client.getTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`${label} transaction is not successful: ${hash}`)
  if (expectedContractAddress) {
    if (!receipt.contractAddress) {
      throw new Error(`${label} receipt has no contractAddress.`)
    }
    if (getAddress(receipt.contractAddress) !== expectedContractAddress) {
      throw new Error(
        `${label} receipt address mismatch. Expected ${expectedContractAddress}, got ${receipt.contractAddress}.`,
      )
    }
  }
  return receipt
}

const [feeReceipt, officialReceipt, registryReceipt, bindReceipt] = await Promise.all([
  requireReceipt(FEE_TX, 'FeeVaultV2 deployment', FEE_VAULT),
  requireReceipt(OFFICIAL_TX, 'OfficialIntegrationRegistry deployment', OFFICIAL),
  requireReceipt(REGISTRY_TX, 'RegistryV2 deployment', REGISTRY),
  requireReceipt(BIND_TX, 'Canonical Registry bind'),
])

const [
  feePerNft,
  treasury,
  quoteOne,
  quoteTwo,
  feeBalance,
  officialOwner,
  pendingOwner,
  bootstrapper,
  canonicalFeeVault,
  canonicalRegistry,
  registryOfficial,
] = await Promise.all([
  client.readContract({
    address: FEE_VAULT,
    abi: feeArtifact.abi,
    functionName: 'FEE_PER_NFT',
  }),
  client.readContract({
    address: FEE_VAULT,
    abi: feeArtifact.abi,
    functionName: 'treasury',
  }),
  client.readContract({
    address: FEE_VAULT,
    abi: feeArtifact.abi,
    functionName: 'quote',
    args: [1n],
  }),
  client.readContract({
    address: FEE_VAULT,
    abi: feeArtifact.abi,
    functionName: 'quote',
    args: [2n],
  }),
  client.getBalance({ address: FEE_VAULT }),
  client.readContract({
    address: OFFICIAL,
    abi: officialArtifact.abi,
    functionName: 'owner',
  }),
  client.readContract({
    address: OFFICIAL,
    abi: officialArtifact.abi,
    functionName: 'pendingOwner',
  }),
  client.readContract({
    address: OFFICIAL,
    abi: officialArtifact.abi,
    functionName: 'bootstrapper',
  }),
  client.readContract({
    address: OFFICIAL,
    abi: officialArtifact.abi,
    functionName: 'canonicalFeeVault',
  }),
  client.readContract({
    address: OFFICIAL,
    abi: officialArtifact.abi,
    functionName: 'canonicalRegistry',
  }),
  client.readContract({
    address: REGISTRY,
    abi: registryArtifact.abi,
    functionName: 'officialIntegrationRegistry',
  }),
])

if (feePerNft !== EXPECTED_FEE) throw new Error(`FEE_PER_NFT mismatch: ${feePerNft}`)
if (quoteOne !== EXPECTED_FEE) throw new Error(`quote(1) mismatch: ${quoteOne}`)
if (quoteTwo !== EXPECTED_FEE * 2n) throw new Error(`quote(2) mismatch: ${quoteTwo}`)
if (getAddress(treasury) !== SAFE) throw new Error(`FeeVault treasury mismatch: ${treasury}`)

if (getAddress(officialOwner) !== SAFE) throw new Error(`Official Registry owner mismatch: ${officialOwner}`)
if (getAddress(pendingOwner) !== getAddress(zeroAddress)) {
  throw new Error(`Official Registry unexpectedly has pendingOwner ${pendingOwner}`)
}
if (getAddress(bootstrapper) !== DEPLOYER) throw new Error(`Bootstrapper mismatch: ${bootstrapper}`)
if (getAddress(canonicalFeeVault) !== FEE_VAULT) {
  throw new Error(`Canonical FeeVault mismatch: ${canonicalFeeVault}`)
}
if (getAddress(canonicalRegistry) !== REGISTRY) {
  throw new Error(`Canonical Registry mismatch: ${canonicalRegistry}`)
}
if (getAddress(registryOfficial) !== OFFICIAL) {
  throw new Error(`RegistryV2 Official Registry pointer mismatch: ${registryOfficial}`)
}

const safeAbi = [
  {
    type: 'function',
    name: 'getOwners',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address[]' }],
  },
  {
    type: 'function',
    name: 'getThreshold',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'nonce',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
]

const [safeOwners, safeThreshold, safeNonce, deployerNonce] = await Promise.all([
  client.readContract({ address: SAFE, abi: safeAbi, functionName: 'getOwners' }),
  client.readContract({ address: SAFE, abi: safeAbi, functionName: 'getThreshold' }),
  client.readContract({ address: SAFE, abi: safeAbi, functionName: 'nonce' }),
  client.getTransactionCount({ address: DEPLOYER, blockTag: 'latest' }),
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
  throw new Error('Safe owners do not match the verified 3-owner set.')
}
if (safeThreshold !== 2n) throw new Error(`Safe threshold mismatch: ${safeThreshold}`)
if (safeNonce < 1n) throw new Error(`Safe nonce unexpectedly low: ${safeNonce}`)
if (deployerNonce < 6) throw new Error(`Deployer nonce unexpectedly low after deployment: ${deployerNonce}`)

console.log('RHBurnerPass MAINNET post-deployment verification - READ ONLY')
console.log(`Chain ID: ${liveChainId}`)
console.log('')
console.log('DEPLOYMENTS')
console.log(`FeeVaultV2: ${FEE_VAULT}`)
console.log(`  deployment tx: ${FEE_TX}`)
console.log(`  runtime code hash: ${keccak256(feeCode)}`)
console.log(`OfficialIntegrationRegistry: ${OFFICIAL}`)
console.log(`  deployment tx: ${OFFICIAL_TX}`)
console.log(`  runtime code hash: ${keccak256(officialCode)}`)
console.log(`RegistryV2: ${REGISTRY}`)
console.log(`  deployment tx: ${REGISTRY_TX}`)
console.log(`  runtime code hash: ${keccak256(registryCode)}`)
console.log(`Canonical bind tx: ${BIND_TX}`)
console.log('')
console.log('FEE VAULT')
console.log(`Fixed fee: ${feePerNft} wei = 0.00005 ETH`)
console.log(`quote(1): ${quoteOne} wei`)
console.log(`quote(2): ${quoteTwo} wei`)
console.log(`Immutable treasury: ${treasury}`)
console.log(`Current FeeVault balance: ${feeBalance} wei`)
console.log('')
console.log('OFFICIAL INTEGRATION REGISTRY')
console.log(`Owner: ${officialOwner}`)
console.log(`Pending owner: ${pendingOwner}`)
console.log(`Bootstrapper: ${bootstrapper}`)
console.log(`Canonical FeeVault: ${canonicalFeeVault}`)
console.log(`Canonical Registry: ${canonicalRegistry}`)
console.log('')
console.log('REGISTRY V2')
console.log(`Official Integration Registry pointer: ${registryOfficial}`)
console.log('')
console.log('PROTOCOL SAFE')
console.log(`Safe: ${SAFE}`)
console.log(`Runtime code hash: ${keccak256(safeCode)}`)
console.log(`Threshold: ${safeThreshold} of ${safeOwners.length}`)
console.log(`Nonce: ${safeNonce}`)
console.log('Owners:')
safeOwners.forEach((owner, index) => console.log(`  ${index + 1}. ${owner}`))
console.log('')
console.log(`Deployer latest nonce: ${deployerNonce}`)
console.log(`Deployment blocks: FeeVault=${feeReceipt.blockNumber}, Official=${officialReceipt.blockNumber}, Registry=${registryReceipt.blockNumber}, Bind=${bindReceipt.blockNumber}`)
console.log('')
console.log('POST-DEPLOYMENT VERIFICATION: PASSED')
console.log('No transaction was signed or sent.')

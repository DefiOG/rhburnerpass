import Safe from '@safe-global/protocol-kit'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  getAddress,
  http,
  keccak256,
  parseAbi,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const CHAIN_ID = 4663
const SAFE = getAddress('0xA70bDD510A6D339318FdBCaFb60862FDD39AbA0b')
const OFFICIAL_REGISTRY = getAddress('0xb8d1f6F919B5A19B1EA1036f2358f21184f4C282')
const TARGET = getAddress('0x94FEa8Ea67f8B2B72c9c196aCAFd2C0471F30309')
const EXPECTED_CODE_HASH = '0x359df5d26837ffca05ddd94e85ec92f85d624602db822411eacea56ced8b82c0'
const CANONICAL_REGISTRY = getAddress('0xA6D25fD2214C6c136599F65bDc07DE77A5f67d6e')
const CANONICAL_FEE_VAULT = getAddress('0xd3e873CCE414a0a24F9E888236faCe40ab6C02DA')
const EXPECTED_DEPLOYER = getAddress('0x42A6ED4FEfffc4D0f12312453e6E36d42A1Eb16B')
const REQUIRED_LOCK = 'EXECUTE_RHBP_REFERENCE_APPROVAL_4663'

const EXPECTED_OWNERS = new Set([
  '0xeec6244d9fbce601ce824a9594238e9c9b3770be',
  '0x2966c9bb3ef150db20387f3ed5ab15dd2a7b2f29',
  '0x980ea39f124fdc7c79e7975280c1cc8bf352c5c5',
])

const rpc = process.env.RH_RPC_URL
const key = process.env.DEPLOYER_PRIVATE_KEY
if (!rpc) throw new Error('RH_RPC_URL missing.')
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('DEPLOYER_PRIVATE_KEY missing or malformed.')

const signer1 = getAddress(process.env.SAFE_APPROVAL_SIGNER_1 || '')
const signer2 = getAddress(process.env.SAFE_APPROVAL_SIGNER_2 || '')
const sig1 = process.env.SAFE_APPROVAL_SIGNATURE_1
const sig2 = process.env.SAFE_APPROVAL_SIGNATURE_2
const savedHash = process.env.SAFE_APPROVAL_TX_HASH

if (signer1.toLowerCase() === signer2.toLowerCase()) throw new Error('Two distinct Safe owners must sign.')
for (const signer of [signer1, signer2]) {
  if (!EXPECTED_OWNERS.has(signer.toLowerCase())) throw new Error(`${signer} is not an expected Safe owner.`)
}
for (const sig of [sig1, sig2]) {
  if (!sig || !/^0x[0-9a-fA-F]{130}$/.test(sig)) throw new Error('A Safe approval signature is missing or malformed.')
}

const account = privateKeyToAccount(key)
if (getAddress(account.address) !== EXPECTED_DEPLOYER) throw new Error('Deployer key does not match the expected gas-paying EOA.')

const chain = defineChain({
  id: CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
})

const publicClient = createPublicClient({ chain, transport: http(rpc) })
const walletClient = createWalletClient({ account, chain, transport: http(rpc) })
const liveChainId = await publicClient.getChainId()
if (liveChainId !== CHAIN_ID) throw new Error(`RPC chain mismatch: ${liveChainId}`)

const registryAbi = parseAbi([
  'function owner() view returns (address)',
  'function canonicalRegistry() view returns (address)',
  'function canonicalFeeVault() view returns (address)',
  'function isOfficialIntegration(address) view returns (bool)',
  'function approveIntegration(address,bytes32)',
])
const targetAbi = parseAbi([
  'function rhBurnerPassRegistry() view returns (address)',
  'function rhBurnerPassFeeVault() view returns (address)',
])

const code = await publicClient.getBytecode({ address: TARGET })
if (!code || code === '0x') throw new Error('Reference mint has no runtime bytecode.')
const codeHash = keccak256(code)
if (codeHash.toLowerCase() !== EXPECTED_CODE_HASH.toLowerCase()) {
  throw new Error(`Reference mint runtime code hash changed: ${codeHash}`)
}

const [owner, canonicalRegistry, canonicalFeeVault, targetRegistry, targetFeeVault, officialBefore] = await Promise.all([
  publicClient.readContract({ address: OFFICIAL_REGISTRY, abi: registryAbi, functionName: 'owner' }),
  publicClient.readContract({ address: OFFICIAL_REGISTRY, abi: registryAbi, functionName: 'canonicalRegistry' }),
  publicClient.readContract({ address: OFFICIAL_REGISTRY, abi: registryAbi, functionName: 'canonicalFeeVault' }),
  publicClient.readContract({ address: TARGET, abi: targetAbi, functionName: 'rhBurnerPassRegistry' }),
  publicClient.readContract({ address: TARGET, abi: targetAbi, functionName: 'rhBurnerPassFeeVault' }),
  publicClient.readContract({ address: OFFICIAL_REGISTRY, abi: registryAbi, functionName: 'isOfficialIntegration', args: [TARGET] }),
])

if (getAddress(owner) !== SAFE) throw new Error(`Official registry owner mismatch: ${owner}`)
if (getAddress(canonicalRegistry) !== CANONICAL_REGISTRY) throw new Error('Canonical RegistryV2 mismatch.')
if (getAddress(canonicalFeeVault) !== CANONICAL_FEE_VAULT) throw new Error('Canonical FeeVaultV2 mismatch.')
if (getAddress(targetRegistry) !== CANONICAL_REGISTRY) throw new Error('Target RegistryV2 binding mismatch.')
if (getAddress(targetFeeVault) !== CANONICAL_FEE_VAULT) throw new Error('Target FeeVaultV2 binding mismatch.')
if (officialBefore) throw new Error('Reference mint is already official; refusing duplicate approval execution.')

const approvalData = encodeFunctionData({
  abi: registryAbi,
  functionName: 'approveIntegration',
  args: [TARGET, EXPECTED_CODE_HASH],
})

const kit = await Safe.init({ provider: rpc, signer: signer1, safeAddress: SAFE })
const [owners, threshold, nonceBefore] = await Promise.all([
  kit.getOwners(),
  kit.getThreshold(),
  kit.getNonce(),
])

if (Number(threshold) !== 2) throw new Error(`Unexpected Safe threshold ${threshold}.`)
const ownerSet = new Set(owners.map((x) => x.toLowerCase()))
if ([signer1, signer2].some((x) => !ownerSet.has(x.toLowerCase()))) {
  throw new Error('Signer is not an on-chain Safe owner.')
}

const safeTransaction = await kit.createTransaction({
  transactions: [{ to: OFFICIAL_REGISTRY, value: '0', data: approvalData }],
})
const txHash = await kit.getTransactionHash(safeTransaction)

if (!savedHash) throw new Error('SAFE_APPROVAL_TX_HASH is missing.')
if (savedHash.toLowerCase() !== txHash.toLowerCase()) {
  throw new Error(`Safe transaction hash changed. Signed ${savedHash}, current ${txHash}. Do not execute.`)
}

const pairs = [
  { signer: signer1.toLowerCase(), signature: sig1 },
  { signer: signer2.toLowerCase(), signature: sig2 },
].sort((a, b) => a.signer.localeCompare(b.signer))
const signatures = `0x${pairs.map((p) => p.signature.slice(2)).join('')}`

const safeAbi = parseAbi([
  'function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,bytes signatures) external payable returns (bool success)',
])

const d = safeTransaction.data
const args = [
  getAddress(d.to),
  BigInt(d.value),
  d.data,
  Number(d.operation),
  BigInt(d.safeTxGas),
  BigInt(d.baseGas),
  BigInt(d.gasPrice),
  getAddress(d.gasToken),
  getAddress(d.refundReceiver),
  signatures,
]

console.log('RHBurnerPass reference mint Safe approval')
console.log(`Chain ID: ${liveChainId}`)
console.log(`Safe: ${SAFE}`)
console.log(`Safe nonce: ${nonceBefore}`)
console.log(`Safe tx hash: ${txHash}`)
console.log(`OfficialIntegrationRegistry: ${OFFICIAL_REGISTRY}`)
console.log(`Reference mint: ${TARGET}`)
console.log(`Runtime code hash: ${codeHash}`)
console.log('Value: 0 ETH')
console.log(`Signer 1: ${signer1}`)
console.log(`Signer 2: ${signer2}`)
console.log(`Executor/gas payer: ${account.address}`)
console.log('')

await publicClient.simulateContract({
  account: account.address,
  address: SAFE,
  abi: safeAbi,
  functionName: 'execTransaction',
  args,
})

console.log('SIMULATION: passed. Both signatures are accepted and the Safe approval transaction succeeds.')

if (process.env.CONFIRM_SAFE_APPROVAL_EXEC !== REQUIRED_LOCK) {
  console.log('SAFETY LOCK ACTIVE. No transaction was sent.')
  console.log(`To execute, set CONFIRM_SAFE_APPROVAL_EXEC=${REQUIRED_LOCK} in .env.mainnet and rerun.`)
  process.exit(0)
}

const hash = await walletClient.writeContract({
  account,
  address: SAFE,
  abi: safeAbi,
  functionName: 'execTransaction',
  args,
})
console.log(`Execution tx: ${hash}`)

const receipt = await publicClient.waitForTransactionReceipt({ hash })
if (receipt.status !== 'success') throw new Error('Safe approval transaction reverted.')

const [officialAfter, kitAfter] = await Promise.all([
  publicClient.readContract({ address: OFFICIAL_REGISTRY, abi: registryAbi, functionName: 'isOfficialIntegration', args: [TARGET] }),
  Safe.init({ provider: rpc, signer: signer1, safeAddress: SAFE }),
])
const nonceAfter = await kitAfter.getNonce()

if (!officialAfter) throw new Error('Safe transaction succeeded but reference mint is not reported as official.')
if (Number(nonceAfter) !== Number(nonceBefore) + 1) {
  throw new Error(`Safe nonce did not increment as expected (${nonceBefore} -> ${nonceAfter}).`)
}

console.log('RHBURNERPASS REFERENCE MINT OFFICIAL APPROVAL VERIFIED')
console.log(`Official integration: ${officialAfter}`)
console.log(`Safe nonce: ${nonceBefore} -> ${nonceAfter}`)
console.log('Clear CONFIRM_SAFE_APPROVAL_EXEC after execution.')

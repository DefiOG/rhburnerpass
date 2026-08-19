import Safe from '@safe-global/protocol-kit'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  parseAbi,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const CHAIN_ID = 4663
const SAFE = getAddress('0xA70bDD510A6D339318FdBCaFb60862FDD39AbA0b')
const TEST_TARGET = getAddress('0x42A6ED4FEfffc4D0f12312453e6E36d42A1Eb16B')
const EXPECTED_DEPLOYER = TEST_TARGET
const EXPECTED_OWNERS = new Set([
  '0xeec6244d9fbce601ce824a9594238e9c9b3770be',
  '0x2966c9bb3ef150db20387f3ed5ab15dd2a7b2f29',
  '0x980ea39f124fdc7c79e7975280c1cc8bf352c5c5',
])
const REQUIRED_LOCK = 'EXECUTE_SAFE_ZERO_VALUE_TEST_4663'

const rpc = process.env.RH_RPC_URL
const key = process.env.DEPLOYER_PRIVATE_KEY
if (!rpc) throw new Error('RH_RPC_URL missing.')
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('DEPLOYER_PRIVATE_KEY missing or malformed.')

const signer1 = getAddress(process.env.SAFE_TEST_SIGNER_1 || '')
const signer2 = getAddress(process.env.SAFE_TEST_SIGNER_2 || '')
const sig1 = process.env.SAFE_TEST_SIGNATURE_1
const sig2 = process.env.SAFE_TEST_SIGNATURE_2
const savedHash = process.env.SAFE_TEST_TX_HASH

if (signer1.toLowerCase() === signer2.toLowerCase()) throw new Error('Two distinct Safe owners must sign.')
for (const signer of [signer1, signer2]) {
  if (!EXPECTED_OWNERS.has(signer.toLowerCase())) throw new Error(`${signer} is not an expected Safe owner.`)
}
for (const sig of [sig1, sig2]) {
  if (!sig || !/^0x[0-9a-fA-F]{130}$/.test(sig)) throw new Error('A Safe test signature is missing or malformed.')
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

const kit = await Safe.init({
  provider: rpc,
  signer: signer1,
  safeAddress: SAFE,
})

const [owners, threshold, nonceBefore] = await Promise.all([
  kit.getOwners(),
  kit.getThreshold(),
  kit.getNonce(),
])

if (Number(threshold) !== 2) throw new Error(`Unexpected Safe threshold ${threshold}.`)
const ownerSet = new Set(owners.map((x) => x.toLowerCase()))
if ([signer1, signer2].some((x) => !ownerSet.has(x.toLowerCase()))) throw new Error('Signer is not an on-chain Safe owner.')

const safeTransaction = await kit.createTransaction({
  transactions: [{
    to: TEST_TARGET,
    value: '0',
    data: '0x',
  }],
})
const txHash = await kit.getTransactionHash(safeTransaction)

if (savedHash && savedHash.toLowerCase() !== txHash.toLowerCase()) {
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

console.log('RHBurnerPass Safe 2-of-3 control test')
console.log(`Chain ID: ${liveChainId}`)
console.log(`Safe: ${SAFE}`)
console.log(`Safe nonce: ${nonceBefore}`)
console.log(`Safe tx hash: ${txHash}`)
console.log(`Target: ${TEST_TARGET}`)
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

console.log('SIMULATION: passed. Both signatures are accepted by the Safe.')

if (process.env.CONFIRM_SAFE_TEST_EXEC !== REQUIRED_LOCK) {
  console.log('SAFETY LOCK ACTIVE. No transaction was sent.')
  console.log(`To execute the harmless test, set CONFIRM_SAFE_TEST_EXEC=${REQUIRED_LOCK} in .env.mainnet and rerun.`)
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
if (receipt.status !== 'success') throw new Error('Safe control test reverted.')

const kitAfter = await Safe.init({ provider: rpc, signer: signer1, safeAddress: SAFE })
const nonceAfter = await kitAfter.getNonce()
if (Number(nonceAfter) !== Number(nonceBefore) + 1) {
  throw new Error(`Transaction succeeded but Safe nonce did not increment as expected (${nonceBefore} -> ${nonceAfter}).`)
}

console.log('SAFE 2-OF-3 CONTROL TEST VERIFIED')
console.log(`Safe nonce: ${nonceBefore} -> ${nonceAfter}`)
console.log('The Safe executed a 0-value transaction authorized by two distinct owners.')
console.log('Clear CONFIRM_SAFE_TEST_EXEC after this test.')

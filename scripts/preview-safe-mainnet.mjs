import Safe from '@safe-global/protocol-kit'
import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
} from 'viem'

const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com'
const EXPECTED_CHAIN_ID = 4663

const owners = [
  getAddress('0xeec6244D9FBCE601ce824A9594238e9C9b3770bE'),
  getAddress('0x2966c9Bb3eF150db20387f3eD5ab15DD2a7b2f29'),
  getAddress('0x980Ea39f124FdC7c79e7975280C1cc8Bf352C5C5'),
]
const threshold = 2

const chain = defineChain({
  id: EXPECTED_CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
})

const publicClient = createPublicClient({
  chain,
  transport: http(RPC_URL),
})

const liveChainId = await publicClient.getChainId()
if (liveChainId !== EXPECTED_CHAIN_ID) {
  throw new Error(
    `RPC chain mismatch. Expected ${EXPECTED_CHAIN_ID}, got ${liveChainId}. Nothing was sent.`
  )
}

console.log('RHBurnerPass Safe preview - READ ONLY')
console.log('Network: Robinhood Chain mainnet')
console.log(`Chain ID verified: ${liveChainId}`)
console.log('')
console.log('Owners:')
owners.forEach((owner, index) => console.log(`  ${index + 1}. ${owner}`))
console.log(`Threshold: ${threshold} of ${owners.length}`)
console.log('')

const protocolKit = await Safe.init({
  provider: RPC_URL,
  // Address only: no private key is used and this script cannot sign.
  signer: owners[0],
  predictedSafe: {
    safeAccountConfig: {
      owners,
      threshold,
    },
    safeDeploymentConfig: {
      // Fixed nonce makes the prediction repeatable for this exact configuration.
      saltNonce: '4663',
    },
  },
})

const safeAddress = await protocolKit.getAddress()
const existingCode = await publicClient.getBytecode({ address: safeAddress })
const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction()

console.log(`Predicted Safe address: ${safeAddress}`)
console.log(`Already deployed: ${existingCode && existingCode !== '0x' ? 'YES' : 'NO'}`)
console.log('')
console.log('Deployment transaction preview:')
console.log(`  To:    ${deploymentTransaction.to}`)
console.log(`  Value: ${deploymentTransaction.value}`)
console.log(`  Data:  ${deploymentTransaction.data}`)
console.log('')
console.log('READ-ONLY COMPLETE. No transaction was signed or sent.')

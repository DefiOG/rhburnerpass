import fs from 'node:fs'
import { createPublicClient, createWalletClient, defineChain, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const rpc = process.env.RH_RPC_URL || 'https://rpc.testnet.chain.robinhood.com'
const required = ['DEPLOYER_PRIVATE_KEY', 'RHBP_REGISTRY_ADDRESS', 'RHBP_FEE_VAULT_ADDRESS', 'MERKLE_ROOT', 'PROJECT_TREASURY_ADDRESS']
for (const name of required) if (!process.env[name]) throw new Error(`Missing ${name}`)
const mintPrice = BigInt(process.env.MINT_PRICE_WEI || '0')

const chain = defineChain({ id: 46630, name: 'Robinhood Chain Testnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } })
const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY)
const wallet = createWalletClient({ account, chain, transport: http(rpc) })
const publicClient = createPublicClient({ chain, transport: http(rpc) })
const artifact = JSON.parse(fs.readFileSync('artifacts/RHBurnerPassDemoMint.json', 'utf8'))
const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [process.env.RHBP_REGISTRY_ADDRESS, process.env.RHBP_FEE_VAULT_ADDRESS, process.env.MERKLE_ROOT, mintPrice, process.env.PROJECT_TREASURY_ADDRESS],
})
console.log(`Demo mint tx: ${hash}`)
const receipt = await publicClient.waitForTransactionReceipt({ hash })
console.log(`RHBurnerPassDemoMint: ${receipt.contractAddress}`)

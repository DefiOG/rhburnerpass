import fs from 'node:fs'
import { createPublicClient, createWalletClient, defineChain, encodeDeployData, formatEther, getAddress, getContractAddress, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const CHAIN_ID = 4663
const REQUIRED_CONFIRMATION = 'RHBURNERPASS_REFERENCE_MAINNET'
const REGISTRY = getAddress('0xA6D25fD2214C6c136599F65bDc07DE77A5f67d6e')
const FEE_VAULT = getAddress('0xd3e873CCE414a0a24F9E888236faCe40ab6C02DA')
const OFFICIAL_REGISTRY = getAddress('0xb8d1f6F919B5A19B1EA1036f2358f21184f4C282')
const PROTOCOL_SAFE = getAddress('0xA70bDD510A6D339318FdBCaFb60862FDD39AbA0b')

const rpc = process.env.RH_RPC_URL
const key = process.env.DEPLOYER_PRIVATE_KEY
const root = process.env.REFERENCE_MERKLE_ROOT
const mintPrice = BigInt(process.env.REFERENCE_MINT_PRICE_WEI ?? '0')
const maxSupply = BigInt(process.env.REFERENCE_MAX_SUPPLY ?? '100')
if (!rpc) throw new Error('RH_RPC_URL is missing from .env.mainnet.')
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('DEPLOYER_PRIVATE_KEY is missing or malformed in .env.mainnet.')
if (!root || !/^0x[0-9a-fA-F]{64}$/.test(root) || /^0x0{64}$/i.test(root)) throw new Error('REFERENCE_MERKLE_ROOT is missing, malformed, or zero.')
if (mintPrice < 0n) throw new Error('REFERENCE_MINT_PRICE_WEI cannot be negative.')
if (maxSupply <= 0n) throw new Error('REFERENCE_MAX_SUPPLY must be greater than zero.')

const deploymentFile = 'deployments/reference-mainnet.json'
if (fs.existsSync(deploymentFile)) throw new Error(`${deploymentFile} already exists. Refusing to deploy a duplicate reference mint.`)

const account = privateKeyToAccount(key)
const chain = defineChain({ id: CHAIN_ID, name: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } })
const publicClient = createPublicClient({ chain, transport: http(rpc) })
const walletClient = createWalletClient({ account, chain, transport: http(rpc) })
const artifactPath = 'artifacts/RHBurnerPassReferenceMint.json'
if (!fs.existsSync(artifactPath)) throw new Error(`Missing ${artifactPath}. Run .\\VERIFY_HARDENING.cmd first.`)
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
if (!artifact.abi || !artifact.bytecode || artifact.bytecode === '0x') throw new Error(`Invalid ${artifactPath}.`)

const [liveChainId, registryCode, feeCode, officialCode, deployerBalance, nonce] = await Promise.all([
  publicClient.getChainId(), publicClient.getBytecode({ address: REGISTRY }), publicClient.getBytecode({ address: FEE_VAULT }), publicClient.getBytecode({ address: OFFICIAL_REGISTRY }), publicClient.getBalance({ address: account.address }), publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' })
])
if (liveChainId !== CHAIN_ID) throw new Error(`Wrong chain. Expected ${CHAIN_ID}, got ${liveChainId}.`)
for (const [label, code] of [['RegistryV2', registryCode], ['FeeVaultV2', feeCode], ['OfficialIntegrationRegistry', officialCode]]) if (!code || code === '0x') throw new Error(`${label} has no code at its canonical address.`)

const feeAbi = [{ type:'function', name:'FEE_PER_NFT', stateMutability:'view', inputs:[], outputs:[{name:'',type:'uint256'}] }]
const registryAbi = [{ type:'function', name:'officialIntegrationRegistry', stateMutability:'view', inputs:[], outputs:[{name:'',type:'address'}] }]
const [feePerNft, officialPointer] = await Promise.all([
  publicClient.readContract({ address:FEE_VAULT, abi:feeAbi, functionName:'FEE_PER_NFT' }),
  publicClient.readContract({ address:REGISTRY, abi:registryAbi, functionName:'officialIntegrationRegistry' }),
])
if (feePerNft !== 50_000_000_000_000n) throw new Error(`Unexpected protocol fee: ${feePerNft}.`)
if (getAddress(officialPointer) !== OFFICIAL_REGISTRY) throw new Error(`RegistryV2 points to unexpected OfficialIntegrationRegistry: ${officialPointer}`)

const constructorArgs = [REGISTRY, FEE_VAULT, root, mintPrice, maxSupply, PROTOCOL_SAFE]
const deployData = encodeDeployData({ abi:artifact.abi, bytecode:artifact.bytecode, args:constructorArgs })
const gas = await publicClient.estimateGas({ account:account.address, data:deployData })
const fees = await publicClient.estimateFeesPerGas()
const maxFeePerGas = fees.maxFeePerGas ?? fees.gasPrice ?? 0n
const preferredBalance = ((gas * 150n) / 100n) * maxFeePerGas * 2n
const predictedAddress = getAddress(getContractAddress({ from:account.address, nonce:BigInt(nonce) }))

console.log('RHBurnerPass MAINNET reference mint preflight')
console.log(`Chain ID: ${liveChainId}`)
console.log(`Deployer: ${getAddress(account.address)}`)
console.log(`Pending nonce: ${nonce}`)
console.log(`Predicted reference mint: ${predictedAddress}`)
console.log(`Deployer balance: ${formatEther(deployerBalance)} ETH`)
console.log(`Preferred 2x deployment balance: ${formatEther(preferredBalance)} ETH`)
console.log(`RegistryV2: ${REGISTRY}`)
console.log(`FeeVaultV2: ${FEE_VAULT}`)
console.log(`OfficialIntegrationRegistry: ${OFFICIAL_REGISTRY}`)
console.log(`Project treasury: ${PROTOCOL_SAFE}`)
console.log(`Merkle root: ${root}`)
console.log(`Mint price: ${formatEther(mintPrice)} ETH`)
console.log(`Max supply: ${maxSupply}`)
console.log(`Delegated protocol fee: ${formatEther(feePerNft)} ETH per NFT`)
if (deployerBalance < preferredBalance) throw new Error(`Deployer balance is below the preferred 2x deployment safety balance. Need about ${formatEther(preferredBalance)} ETH. Nothing was sent.`)
if (process.env.CONFIRM_REFERENCE_MINT_DEPLOY !== REQUIRED_CONFIRMATION) {
  console.log('REFERENCE MINT SAFETY LOCK ACTIVE. No transaction was signed or sent.')
  console.log(`To deploy, set CONFIRM_REFERENCE_MINT_DEPLOY=${REQUIRED_CONFIRMATION} and rerun this exact script.`)
  process.exit(0)
}

console.log('REFERENCE MINT SAFETY LOCK ACCEPTED.')
const hash = await walletClient.deployContract({ account, abi:artifact.abi, bytecode:artifact.bytecode, args:constructorArgs, nonce })
console.log(`Deployment tx: ${hash}`)
const receipt = await publicClient.waitForTransactionReceipt({ hash })
if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error(`Reference mint deployment failed. Tx: ${hash}`)
const deployed = getAddress(receipt.contractAddress)
if (deployed !== predictedAddress) throw new Error(`Unexpected deployed address ${deployed}; predicted ${predictedAddress}.`)
const code = await publicClient.getBytecode({ address:deployed })
if (!code || code === '0x') throw new Error('Deployment succeeded but runtime bytecode is not readable.')

const abi = [
 {type:'function',name:'rhBurnerPassRegistry',stateMutability:'view',inputs:[],outputs:[{name:'',type:'address'}]},
 {type:'function',name:'rhBurnerPassFeeVault',stateMutability:'view',inputs:[],outputs:[{name:'',type:'address'}]},
 {type:'function',name:'merkleRoot',stateMutability:'view',inputs:[],outputs:[{name:'',type:'bytes32'}]},
 {type:'function',name:'mintPrice',stateMutability:'view',inputs:[],outputs:[{name:'',type:'uint256'}]},
 {type:'function',name:'maxSupply',stateMutability:'view',inputs:[],outputs:[{name:'',type:'uint256'}]},
 {type:'function',name:'projectTreasury',stateMutability:'view',inputs:[],outputs:[{name:'',type:'address'}]},
]
const [boundRegistry,boundFeeVault,liveRoot,livePrice,liveMaxSupply,liveTreasury]=await Promise.all([
 publicClient.readContract({address:deployed,abi,functionName:'rhBurnerPassRegistry'}), publicClient.readContract({address:deployed,abi,functionName:'rhBurnerPassFeeVault'}), publicClient.readContract({address:deployed,abi,functionName:'merkleRoot'}), publicClient.readContract({address:deployed,abi,functionName:'mintPrice'}), publicClient.readContract({address:deployed,abi,functionName:'maxSupply'}), publicClient.readContract({address:deployed,abi,functionName:'projectTreasury'})
])
if(getAddress(boundRegistry)!==REGISTRY) throw new Error('Wrong RegistryV2 binding.')
if(getAddress(boundFeeVault)!==FEE_VAULT) throw new Error('Wrong FeeVaultV2 binding.')
if(liveRoot.toLowerCase()!==root.toLowerCase()) throw new Error('Wrong Merkle root.')
if(livePrice!==mintPrice) throw new Error('Wrong mint price.')
if(liveMaxSupply!==maxSupply) throw new Error('Wrong max supply.')
if(getAddress(liveTreasury)!==PROTOCOL_SAFE) throw new Error('Wrong project treasury.')

fs.mkdirSync('deployments',{recursive:true})
fs.writeFileSync(deploymentFile,JSON.stringify({network:'Robinhood Chain',chainId:CHAIN_ID,contract:'RHBurnerPassReferenceMint',address:deployed,deploymentTx:hash,deploymentBlock:receipt.blockNumber.toString(),deployer:getAddress(account.address),registry:REGISTRY,feeVault:FEE_VAULT,officialIntegrationRegistry:OFFICIAL_REGISTRY,projectTreasury:PROTOCOL_SAFE,merkleRoot:root,mintPriceWei:mintPrice.toString(),maxSupply:maxSupply.toString(),protocolFeePerNftWei:feePerNft.toString()},null,2)+'\n')
console.log('RHBURNERPASS MAINNET REFERENCE MINT DEPLOYMENT VERIFIED')
console.log(`Reference mint: ${deployed}`)
console.log(`Deployment tx: ${hash}`)
console.log(`Wrote ${deploymentFile}`)
console.log('IMPORTANT: immediately clear CONFIRM_REFERENCE_MINT_DEPLOY in .env.mainnet.')
console.log('The reference mint is NOT an official integration until the protocol Safe separately approves its exact runtime code hash.')

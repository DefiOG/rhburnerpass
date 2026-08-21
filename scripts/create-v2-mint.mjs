import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { createPublicClient, createWalletClient, decodeEventLog, defineChain, http, isAddress, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const network = process.argv.find((x) => x.startsWith('--network='))?.split('=')[1] || 'testnet'
if (!['testnet', 'mainnet'].includes(network)) throw new Error('Use --network=testnet or --network=mainnet.')
const isMainnet = network === 'mainnet'
if (isMainnet && process.env.CONFIRM_RHBP_V2_MINT_MAINNET !== 'CREATE_RHBP_V2_MINT_MAINNET') throw new Error('Mainnet mint creation locked. Set CONFIRM_RHBP_V2_MINT_MAINNET=CREATE_RHBP_V2_MINT_MAINNET intentionally.')
const key = process.env.DEPLOYER_PRIVATE_KEY
const factory = process.env.RHBP_V2_FACTORY_ADDRESS
if (!key) throw new Error('Set DEPLOYER_PRIVATE_KEY locally. Never commit it.')
if (!factory || !isAddress(factory)) throw new Error('Set RHBP_V2_FACTORY_ADDRESS.')
const rpc = process.env.RH_RPC_URL || (isMainnet ? undefined : 'https://rpc.testnet.chain.robinhood.com')
if (!rpc) throw new Error('RH_RPC_URL is required for mainnet.')
const cfg = isMainnet ? { id: 4663, name: 'Robinhood Chain' } : { id: 46630, name: 'Robinhood Chain Testnet' }
const chain = defineChain({ id: cfg.id, name: cfg.name, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } })
const account = privateKeyToAccount(key)
const wallet = createWalletClient({ account, chain, transport: http(rpc) })
const publicClient = createPublicClient({ chain, transport: http(rpc) })
if (await publicClient.getChainId() !== cfg.id) throw new Error(`RPC chain mismatch; expected ${cfg.id}.`)
const factoryArtifact = JSON.parse(fs.readFileSync('artifacts/RHBurnerPassFactoryV2.json', 'utf8'))
const rl = readline.createInterface({ input, output })
const ask = async (label, fallback = '') => (await rl.question(`${label}${fallback ? ` [${fallback}]` : ''}: `)).trim() || fallback
try {
  console.log(`\nRHBurnerPass v2 Mint Builder — ${cfg.name}`)
  console.log(`Integration owner: ${account.address}`)
  const name = await ask('Collection name')
  const symbol = await ask('Symbol')
  const maxSupply = BigInt(await ask('Max supply'))
  const mintPriceEth = await ask('Mint price in ETH', '0')
  const projectTreasury = await ask('Project treasury address', account.address)
  const payout = await ask('10% RHBP partner payout address', account.address)
  const baseTokenURI = await ask('Base metadata URI (example ipfs://CID/)', '')
  const allowlistFile = await ask('Allowlist JSON file', 'allowlist.json')
  if (!name || !symbol || maxSupply <= 0n) throw new Error('Name, symbol, and positive max supply are required.')
  if (!isAddress(projectTreasury) || !isAddress(payout)) throw new Error('Treasury and payout must be valid EVM addresses.')
  if (!fs.existsSync(allowlistFile)) throw new Error(`Missing ${allowlistFile}.`)
  const rows = JSON.parse(fs.readFileSync(allowlistFile, 'utf8'))
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Allowlist must contain at least one entry.')
  const seen = new Set()
  const normalizedRows = rows.map((row, i) => {
    if (!row || !isAddress(row.address)) throw new Error(`Allowlist row ${i + 1} has an invalid address.`)
    let allocation
    try { allocation = BigInt(row.maxAllocation) } catch { throw new Error(`Allowlist row ${i + 1} has an invalid maxAllocation.`) }
    if (allocation <= 0n) throw new Error(`Allowlist row ${i + 1} maxAllocation must be positive.`)
    const key = row.address.toLowerCase()
    if (seen.has(key)) throw new Error(`Duplicate allowlist address: ${row.address}`)
    seen.add(key)
    return [row.address, allocation.toString()]
  })
  const tree = StandardMerkleTree.of(normalizedRows, ['address', 'uint256'])
  const entries = []
  for (const [i, value] of tree.entries()) entries.push({ address: value[0], maxAllocation: value[1], proof: tree.getProof(i) })
  console.log(`\nName: ${name} (${symbol})\nSupply: ${maxSupply}\nMint price: ${mintPriceEth} ETH\nMerkle root: ${tree.root}`)
  console.log(`Project treasury: ${projectTreasury}\nPartner payout: ${payout}`)
  console.log('RHBP delegated fee: 0.00005 ETH/NFT (90% protocol / 10% partner)')
  if (await ask('Type DEPLOY to continue') !== 'DEPLOY') throw new Error('Cancelled.')
  const { request } = await publicClient.simulateContract({ account, address: factory, abi: factoryArtifact.abi, functionName: 'createMint', args: [name, symbol, tree.root, parseEther(mintPriceEth), maxSupply, projectTreasury, payout, baseTokenURI] })
  const hash = await wallet.writeContract(request)
  console.log(`Factory createMint tx: ${hash}`)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('Mint deployment reverted.')
  let mintAddress
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== factory.toLowerCase()) continue
    try {
      const decoded = decodeEventLog({ abi: factoryArtifact.abi, data: log.data, topics: log.topics })
      if (decoded.eventName === 'MintCreated') { mintAddress = decoded.args.mint; break }
    } catch {}
  }
  if (!mintAddress) throw new Error('Could not locate MintCreated event.')
  const outDir = path.join('mint-deployments', mintAddress)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'allowlist-output.json'), JSON.stringify({ root: tree.root, entries }, null, 2))
  fs.writeFileSync(path.join(outDir, 'mint-config.json'), JSON.stringify({ network: cfg.name, chainId: cfg.id, factory, mintAddress, integrationOwner: account.address, partnerPayout: payout, projectTreasury, name, symbol, maxSupply: maxSupply.toString(), mintPriceEth, merkleRoot: tree.root, baseTokenURI }, null, 2))
  console.log(`\nCanonical RHBP mint: ${mintAddress}`)
  console.log(`Wrote ${outDir}/mint-config.json and allowlist-output.json`)
} finally { rl.close() }

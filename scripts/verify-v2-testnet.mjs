import fs from 'node:fs'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  encodeFunctionData,
  formatEther,
  http,
  isAddress,
  parseEther,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const rpc = process.env.RH_RPC_URL || 'https://rpc.testnet.chain.robinhood.com'
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY
const factoryAddress = process.env.RHBP_V2_FACTORY_ADDRESS
const registryAddress = process.env.RHBP_V2_REGISTRY_ADDRESS
const feeVaultAddress = process.env.RHBP_V2_FEE_VAULT_ADDRESS
if (!deployerKey) throw new Error('Set DEPLOYER_PRIVATE_KEY locally. Never paste or commit it.')
for (const [name, value] of Object.entries({ RHBP_V2_FACTORY_ADDRESS: factoryAddress, RHBP_V2_REGISTRY_ADDRESS: registryAddress, RHBP_V2_FEE_VAULT_ADDRESS: feeVaultAddress })) {
  if (!value || !isAddress(value)) throw new Error(`Set a valid ${name}.`)
}

const chain = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
})
const publicClient = createPublicClient({ chain, transport: http(rpc) })
if (await publicClient.getChainId() !== 46630) throw new Error('RPC is not Robinhood Chain Testnet (46630).')

const deployer = privateKeyToAccount(deployerKey)
const walletFor = (account) => createWalletClient({ account, chain, transport: http(rpc) })
const deployerWallet = walletFor(deployer)
const artifact = (name) => JSON.parse(fs.readFileSync(`artifacts/${name}.json`, 'utf8'))
const factoryAbi = artifact('RHBurnerPassFactoryV2').abi
const registryAbi = artifact('RHBurnerPassRegistryV3').abi
const feeAbi = artifact('RHBurnerPassFeeVaultV3').abi
const mintAbi = artifact('RHBurnerPassMintTemplateV2').abi
const feePerNft = 50_000_000_000_000n
const partnerPerNft = 5_000_000_000_000n
const protocolPerNft = 45_000_000_000_000n
const lower = (x) => x.toLowerCase()
const assert = (ok, msg) => { if (!ok) throw new Error(`ASSERTION FAILED: ${msg}`) }

async function send(wallet, request) {
  const hash = await wallet.writeContract(request)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`Transaction reverted: ${hash}`)
  return receipt
}
async function simulateAndSend(wallet, account, address, abi, functionName, args = [], value) {
  const { request } = await publicClient.simulateContract({ account, address, abi, functionName, args, ...(value !== undefined ? { value } : {}) })
  return send(wallet, request)
}
async function expectSimulationRevert(label, params) {
  try {
    await publicClient.simulateContract(params)
  } catch {
    console.log(`PASS: ${label} reverted as expected`)
    return
  }
  throw new Error(`ASSERTION FAILED: ${label} unexpectedly succeeded`)
}
async function fund(address, amount) {
  const hash = await deployerWallet.sendTransaction({ account: deployer, to: address, value: amount })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`Funding failed: ${hash}`)
}
async function createMint({ root, payout, suffix }) {
  const { request } = await publicClient.simulateContract({
    account: deployer,
    address: factoryAddress,
    abi: factoryAbi,
    functionName: 'createMint',
    args: [`RHBP V2 Test ${suffix}`, `RHT${suffix}`, root, 0n, 10n, deployer.address, payout, 'ipfs://rhbp-test/'],
  })
  const receipt = await send(deployerWallet, request)
  for (const log of receipt.logs) {
    if (lower(log.address) !== lower(factoryAddress)) continue
    try {
      const decoded = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics })
      if (decoded.eventName === 'MintCreated') return decoded.args.mint
    } catch {}
  }
  throw new Error('MintCreated event not found.')
}

console.log('\nRHBurnerPass v2 — Robinhood Chain Testnet E2E verification')
console.log(`Deployer: ${deployer.address}`)
console.log(`Factory: ${factoryAddress}`)
console.log(`Registry: ${registryAddress}`)
console.log(`FeeVault: ${feeVaultAddress}`)

const [boundRegistry, boundFeeVault, factoryOwner, feeTreasury] = await Promise.all([
  publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: 'registry' }),
  publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: 'feeVault' }),
  publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: 'owner' }),
  publicClient.readContract({ address: feeVaultAddress, abi: feeAbi, functionName: 'treasury' }),
])
assert(lower(boundRegistry) === lower(registryAddress), 'Factory registry binding mismatch')
assert(lower(boundFeeVault) === lower(feeVaultAddress), 'Factory FeeVault binding mismatch')
console.log('PASS: canonical Factory bindings match configured Registry/FeeVault')

const vault = privateKeyToAccount(generatePrivateKey())
const burnerA = privateKeyToAccount(generatePrivateKey())
const burnerB = privateKeyToAccount(generatePrivateKey())
const payoutA = privateKeyToAccount(generatePrivateKey())
const payoutB = privateKeyToAccount(generatePrivateKey())
for (const acct of [vault, burnerA, burnerB]) await fund(acct.address, parseEther('0.002'))
const vaultWallet = walletFor(vault)
const burnerAWallet = walletFor(burnerA)
const burnerBWallet = walletFor(burnerB)

const tree = StandardMerkleTree.of([[vault.address, '3']], ['address', 'uint256'])
const proof = tree.getProof(0)
const mint = await createMint({ root: tree.root, payout: payoutA.address, suffix: 'A' })
console.log(`Canonical test mint: ${mint}`)
assert(await publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: 'isOfficialMint', args: [mint] }), 'Factory mint is not official')
assert(lower(await publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: 'partnerOf', args: [mint] })) === lower(payoutA.address), 'Initial payout mismatch')
console.log('PASS: permissionless Factory mint is automatically canonical and partner-bound')

const randomTarget = privateKeyToAccount(generatePrivateKey()).address
await expectSimulationRevert('non-Factory target authorization', {
  account: vault,
  address: registryAddress,
  abi: registryAbi,
  functionName: 'setBurner',
  args: [burnerA.address, randomTarget, true],
})

await simulateAndSend(vaultWallet, vault, registryAddress, registryAbi, 'setBurner', [burnerA.address, mint, true])
console.log('PASS: vault authorized Burner A for exact canonical mint')

async function mintOne(wallet, account) {
  return simulateAndSend(wallet, account, mint, mintAbi, 'mint', [vault.address, 3n, 1n, proof], feePerNft)
}
await mintOne(burnerAWallet, burnerA)
assert((await publicClient.readContract({ address: mint, abi: mintAbi, functionName: 'claimedByVault', args: [vault.address] })) === 1n, 'vault claim did not increment to 1')
assert(lower(await publicClient.readContract({ address: mint, abi: mintAbi, functionName: 'ownerOf', args: [1n] })) === lower(burnerA.address), 'NFT #1 not owned by Burner A')
assert((await publicClient.readContract({ address: feeVaultAddress, abi: feeAbi, functionName: 'partnerAccrued', args: [payoutA.address] })) === partnerPerNft, 'partner share after first mint wrong')
console.log('PASS: Burner A mint -> vault claim + burner NFT + exact 10% partner accrual')

await simulateAndSend(vaultWallet, vault, registryAddress, registryAbi, 'setBurner', [burnerA.address, mint, false])
await simulateAndSend(vaultWallet, vault, registryAddress, registryAbi, 'setBurner', [burnerB.address, mint, true])
await mintOne(burnerBWallet, burnerB)
assert((await publicClient.readContract({ address: mint, abi: mintAbi, functionName: 'claimedByVault', args: [vault.address] })) === 2n, 'vault claim did not carry across burner rotation')
assert(lower(await publicClient.readContract({ address: mint, abi: mintAbi, functionName: 'ownerOf', args: [2n] })) === lower(burnerB.address), 'NFT #2 not owned by Burner B')
console.log('PASS: burner rotation preserved the same vault allocation bucket')

await simulateAndSend(deployerWallet, deployer, factoryAddress, factoryAbi, 'updatePayout', [mint, payoutB.address])
assert(lower(await publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: 'partnerOf', args: [mint] })) === lower(payoutB.address), 'payout update failed')
await mintOne(burnerBWallet, burnerB)
assert((await publicClient.readContract({ address: feeVaultAddress, abi: feeAbi, functionName: 'partnerAccrued', args: [payoutA.address] })) === partnerPerNft * 2n, 'old payout accrual changed unexpectedly')
assert((await publicClient.readContract({ address: feeVaultAddress, abi: feeAbi, functionName: 'partnerAccrued', args: [payoutB.address] })) === partnerPerNft, 'new payout did not receive future fee')
assert((await publicClient.readContract({ address: mint, abi: mintAbi, functionName: 'claimedByVault', args: [vault.address] })) === 3n, 'vault claim should be 3')
console.log('PASS: payout change affects future fees only; old accrual remains with old payout')

await expectSimulationRevert('fourth mint beyond vault allocation', {
  account: burnerB,
  address: mint,
  abi: mintAbi,
  functionName: 'mint',
  args: [vault.address, 3n, 1n, proof],
  value: feePerNft,
})

const protocolAccrued = await publicClient.readContract({ address: feeVaultAddress, abi: feeAbi, functionName: 'protocolAccrued' })
assert(protocolAccrued >= protocolPerNft * 3n, 'protocol accrual is below expected test contribution')
const liabilityBeforeClaim = await publicClient.readContract({ address: feeVaultAddress, abi: feeAbi, functionName: 'totalPartnerLiability' })
const payoutABefore = await publicClient.getBalance({ address: payoutA.address })
await simulateAndSend(deployerWallet, deployer, feeVaultAddress, feeAbi, 'claimPartnerFees', [payoutA.address])
const payoutAAfter = await publicClient.getBalance({ address: payoutA.address })
assert(payoutAAfter - payoutABefore === partnerPerNft * 2n, 'partner claim did not deliver exact accrued amount')
assert((await publicClient.readContract({ address: feeVaultAddress, abi: feeAbi, functionName: 'partnerAccrued', args: [payoutA.address] })) === 0n, 'claimed partner balance not cleared')
assert((await publicClient.readContract({ address: feeVaultAddress, abi: feeAbi, functionName: 'totalPartnerLiability' })) === liabilityBeforeClaim - partnerPerNft * 2n, 'partner liability did not decrease exactly')
console.log('PASS: anyone-triggered partner claim pays only the credited payout wallet')

if (lower(factoryOwner) === lower(deployer.address)) {
  await simulateAndSend(deployerWallet, deployer, factoryAddress, factoryAbi, 'setIntegrationBlocked', [mint, true])
  assert(!(await publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: 'isOfficialMint', args: [mint] })), 'blocked mint still official')
  await expectSimulationRevert('new authorization while integration blocked', {
    account: vault,
    address: registryAddress,
    abi: registryAbi,
    functionName: 'setBurner',
    args: [burnerA.address, mint, true],
  })
  await simulateAndSend(vaultWallet, vault, registryAddress, registryAbi, 'setBurner', [burnerB.address, mint, false])
  const active = await publicClient.readContract({ address: registryAddress, abi: registryAbi, functionName: 'isAuthorized', args: [vault.address, burnerB.address, mint] })
  assert(active === false, 'revocation failed while blocked')
  console.log('PASS: emergency block prevents new authorization but never prevents revocation')
  await simulateAndSend(deployerWallet, deployer, factoryAddress, factoryAbi, 'setIntegrationBlocked', [mint, false])
} else {
  console.log(`SKIP: block/unblock owner action (Factory owner is ${factoryOwner}, not deployer)`)
}

// Direct-vault path on a fresh canonical mint: no RHBP fee, same vault accounting, NFT to vault.
const directTree = StandardMerkleTree.of([[vault.address, '1']], ['address', 'uint256'])
const directProof = directTree.getProof(0)
const directMint = await createMint({ root: directTree.root, payout: payoutB.address, suffix: 'D' })
const protocolBeforeDirect = await publicClient.readContract({ address: feeVaultAddress, abi: feeAbi, functionName: 'protocolAccrued' })
await simulateAndSend(vaultWallet, vault, directMint, mintAbi, 'mint', [vault.address, 1n, 1n, directProof], 0n)
assert((await publicClient.readContract({ address: directMint, abi: mintAbi, functionName: 'claimedByVault', args: [vault.address] })) === 1n, 'direct vault claim not recorded')
assert(lower(await publicClient.readContract({ address: directMint, abi: mintAbi, functionName: 'ownerOf', args: [1n] })) === lower(vault.address), 'direct mint NFT not delivered to vault caller')
assert((await publicClient.readContract({ address: feeVaultAddress, abi: feeAbi, functionName: 'protocolAccrued' })) === protocolBeforeDirect, 'direct vault mint incorrectly charged RHBP fee')
console.log('PASS: direct vault mint is fee-free and consumes the vault allocation')

if (lower(feeTreasury) === lower(deployer.address)) {
  const partnerLiabilityBeforeTreasury = await publicClient.readContract({ address: feeVaultAddress, abi: feeAbi, functionName: 'totalPartnerLiability' })
  await simulateAndSend(deployerWallet, deployer, feeVaultAddress, feeAbi, 'withdrawProtocolFees', [])
  assert((await publicClient.readContract({ address: feeVaultAddress, abi: feeAbi, functionName: 'protocolAccrued' })) === 0n, 'protocolAccrued not cleared')
  assert((await publicClient.readContract({ address: feeVaultAddress, abi: feeAbi, functionName: 'totalPartnerLiability' })) === partnerLiabilityBeforeTreasury, 'treasury withdrawal changed partner liability')
  console.log('PASS: protocol treasury withdrawal cannot sweep partner liabilities')
} else {
  console.log(`SKIP: treasury withdrawal action (FeeVault treasury is ${feeTreasury}, not deployer)`)
}

console.log('\nALL REQUIRED RHBP V2 TESTNET CHECKS PASSED')
console.log(`Temporary vault: ${vault.address}`)
console.log(`Temporary burners: ${burnerA.address}, ${burnerB.address}`)
console.log(`Test fee spent: about ${formatEther(feePerNft * 3n)} ETH plus gas`)
console.log('Ephemeral private keys existed only in this process and were never written to disk.')

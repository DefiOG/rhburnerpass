import fs from 'node:fs'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { getAddress, isAddress } from 'viem'

const vaultRaw = process.argv[2]
const allocationRaw = process.argv[3] ?? '2'
if (!vaultRaw || !isAddress(vaultRaw)) throw new Error('Usage: node scripts/make-reference-allowlist.mjs <vault-address> [max-allocation]')
let allocation
try { allocation = BigInt(allocationRaw) } catch { throw new Error('max-allocation must be a positive integer.') }
if (allocation <= 0n) throw new Error('max-allocation must be greater than zero.')

const vault = getAddress(vaultRaw)
const tree = StandardMerkleTree.of([[vault, allocation.toString()]], ['address', 'uint256'])
const out = {
  purpose: 'RHBurnerPass mainnet reference mint allowlist',
  vault,
  maxAllocation: allocation.toString(),
  root: tree.root,
  proof: tree.getProof(0),
}
fs.mkdirSync('deployments', { recursive: true })
fs.writeFileSync('deployments/reference-allowlist.json', JSON.stringify(out, null, 2) + '\n')
console.log('RHBurnerPass reference allowlist created.')
console.log(`Vault: ${vault}`)
console.log(`Max allocation: ${allocation}`)
console.log(`Merkle root: ${tree.root}`)
console.log('Wrote deployments/reference-allowlist.json')

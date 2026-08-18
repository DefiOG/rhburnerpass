import fs from 'node:fs'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'

const inputFile = process.argv[2] || 'allowlist.json'
if (!fs.existsSync(inputFile)) {
  console.error(`Missing ${inputFile}. Copy allowlist.example.json and edit it.`)
  process.exit(1)
}

const rows = JSON.parse(fs.readFileSync(inputFile, 'utf8'))
const values = rows.map((row) => [row.address, String(row.maxAllocation)])
const tree = StandardMerkleTree.of(values, ['address', 'uint256'])

const entries = []
for (const [i, value] of tree.entries()) {
  entries.push({ address: value[0], maxAllocation: value[1], proof: tree.getProof(i) })
}

const out = { root: tree.root, entries }
fs.writeFileSync('allowlist-output.json', JSON.stringify(out, null, 2))
console.log(`Merkle root: ${tree.root}`)
console.log('wrote allowlist-output.json')

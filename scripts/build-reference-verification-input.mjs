import fs from 'node:fs'
import path from 'node:path'
import solc from 'solc'
import { createPublicClient, encodeDeployData, http } from 'viem'

const root = process.cwd()
const contractsDir = path.join(root, 'contracts')
const nodeModulesDir = path.join(root, 'node_modules')
const outDir = path.join(root, 'verification')
const outFile = path.join(outDir, 'reference-mint-standard-input.json')

const txHash = '0xa6d231d263d93031094a90ba66d7752adba906599475775f54e142c71f4de8bc'

const constructorArgs = [
  '0xA6D25fD2214C6c136599F65bDc07DE77A5f67d6e',
  '0xd3e873CCE414a0a24F9E888236faCe40ab6C02DA',
  '0x16538246712b55f84a4af1bab08dce16a960a9924402f4f6d3745f77a5fa7864',
  0n,
  100n,
  '0xA70bDD510A6D339318FdBCaFb60862FDD39AbA0b',
]

const sources = Object.fromEntries(
  fs.readdirSync(contractsDir)
    .filter((name) => name.endsWith('.sol'))
    .sort()
    .map((name) => [name, { content: fs.readFileSync(path.join(contractsDir, name), 'utf8') }]),
)

const importRe = /^\s*import\s+(?:(?:[^'"]*?\s+from\s+)?["']([^"']+)["'])\s*;/gm

function normalizeSourceName(importer, specifier) {
  if (specifier.startsWith('@')) return path.posix.normalize(specifier)
  if (specifier.startsWith('.')) {
    const base = path.posix.dirname(importer)
    return path.posix.normalize(path.posix.join(base, specifier))
  }
  return path.posix.normalize(specifier)
}

function diskPathFor(sourceName) {
  if (sourceName.startsWith('@')) return path.join(nodeModulesDir, ...sourceName.split('/'))
  return path.join(contractsDir, ...sourceName.split('/'))
}

function addImports(sourceName) {
  const entry = sources[sourceName]
  if (!entry) throw new Error(`Missing source entry: ${sourceName}`)

  importRe.lastIndex = 0
  let match
  while ((match = importRe.exec(entry.content)) !== null) {
    const childName = normalizeSourceName(sourceName, match[1])
    if (!sources[childName]) {
      const file = diskPathFor(childName)
      if (!fs.existsSync(file)) throw new Error(`Import not found: ${childName} -> ${file}`)
      sources[childName] = { content: fs.readFileSync(file, 'utf8') }
      addImports(childName)
    }
  }
}

for (const sourceName of Object.keys(sources)) addImports(sourceName)

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
}

const output = JSON.parse(solc.compile(JSON.stringify(input)))
const errors = (output.errors || []).filter((e) => e.severity === 'error')
if (errors.length) {
  for (const error of errors) console.error(error.formattedMessage)
  process.exit(1)
}

const compiled = output.contracts?.['RHBurnerPassReferenceMint.sol']?.RHBurnerPassReferenceMint
if (!compiled) throw new Error('RHBurnerPassReferenceMint compilation output missing.')

const abi = compiled.abi
const bytecode = `0x${compiled.evm.bytecode.object}`
const expectedDeployData = encodeDeployData({ abi, bytecode, args: constructorArgs })

if (!process.env.RH_RPC_URL) throw new Error('RH_RPC_URL is missing. Run with --env-file=.env.mainnet.')
const client = createPublicClient({ transport: http(process.env.RH_RPC_URL) })
const tx = await client.getTransaction({ hash: txHash })

const matches = tx.input.toLowerCase() === expectedDeployData.toLowerCase()
if (!matches) {
  console.error('REFERENCE VERIFICATION INPUT: FAILED')
  console.error('Self-contained Standard JSON does not reproduce the deployed creation transaction.')
  console.error(`ONCHAIN LENGTH: ${tx.input.length}`)
  console.error(`LOCAL LENGTH: ${expectedDeployData.length}`)
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outFile, JSON.stringify(input, null, 2) + '\n')

console.log('REFERENCE VERIFICATION INPUT: PASSED')
console.log(`Compiler: ${solc.version()}`)
console.log('Optimizer: enabled, runs 200')
console.log(`Sources included: ${Object.keys(sources).length}`)
console.log('DEPLOY DATA MATCH: true')
console.log(`ONCHAIN LENGTH: ${tx.input.length}`)
console.log(`LOCAL LENGTH: ${expectedDeployData.length}`)
console.log(`Wrote ${path.relative(root, outFile)}`)
console.log('No transaction was signed or sent.')

import fs from 'node:fs'
import path from 'node:path'
import solc from 'solc'

const root = process.cwd()
const contractsDir = path.join(root, 'contracts')
const artifactsDir = path.join(root, 'artifacts')
fs.mkdirSync(artifactsDir, { recursive: true })

const sources = Object.fromEntries(
  fs.readdirSync(contractsDir)
    .filter((name) => name.endsWith('.sol'))
    .map((name) => [name, { content: fs.readFileSync(path.join(contractsDir, name), 'utf8') }]),
)

function findImports(importPath) {
  const candidates = [
    path.join(contractsDir, importPath),
    path.join(root, 'node_modules', importPath),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return { contents: fs.readFileSync(candidate, 'utf8') }
  }
  return { error: `Import not found: ${importPath}` }
}

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
}

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }))
const errors = (output.errors || []).filter((e) => e.severity === 'error')
if (errors.length) {
  for (const error of errors) console.error(error.formattedMessage)
  process.exit(1)
}

for (const [sourceName, contracts] of Object.entries(output.contracts || {})) {
  if (!sourceName.startsWith('RHBurnerPass')) continue
  for (const [contractName, artifact] of Object.entries(contracts)) {
    const file = path.join(artifactsDir, `${contractName}.json`)
    fs.writeFileSync(file, JSON.stringify({
      contractName,
      sourceName,
      abi: artifact.abi,
      bytecode: `0x${artifact.evm.bytecode.object}`,
    }, null, 2))
    console.log(`wrote ${path.relative(root, file)}`)
  }
}

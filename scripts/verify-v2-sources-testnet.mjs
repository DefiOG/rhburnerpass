import fs from 'node:fs'
import path from 'node:path'
import solc from 'solc'
import {
  createPublicClient,
  defineChain,
  encodeAbiParameters,
  encodeDeployData,
  http,
} from 'viem'

const root = process.cwd()
const contractsDir = path.join(root, 'contracts')
const verificationDir = path.join(root, 'verification', 'v2-testnet')
const deploymentFile = path.join(root, 'deployments', 'v2-testnet.json')

if (!fs.existsSync(deploymentFile)) {
  throw new Error('Missing deployments/v2-testnet.json. Put the saved v2 testnet deployment record in deployments/.')
}

const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'))
if (Number(deployment.chainId) !== 46630) throw new Error('Deployment record is not Robinhood Chain Testnet (46630).')

const rpc = process.env.RH_RPC_URL || 'https://rpc.testnet.chain.robinhood.com'
if (/mainnet/i.test(rpc)) throw new Error('RPC looks like mainnet; refusing testnet verification.')

const chain = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
})
const client = createPublicClient({ chain, transport: http(rpc) })
const actualChainId = await client.getChainId()
if (actualChainId !== 46630) throw new Error(`RPC chain mismatch; expected 46630, got ${actualChainId}.`)

const sources = Object.fromEntries(
  fs.readdirSync(contractsDir)
    .filter((name) => name.endsWith('.sol'))
    .sort()
    .map((name) => [name, { content: fs.readFileSync(path.join(contractsDir, name), 'utf8') }]),
)

const importRe = /^\s*import\s+(?:(?:[^'\"]*?\s+from\s+)?[\"']([^\"']+)[\"'])\s*;/gm
const nodeModulesDir = path.join(root, 'node_modules')
function normalizeSourceName(importer, specifier) {
  if (specifier.startsWith('@')) return path.posix.normalize(specifier)
  if (specifier.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier))
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

const factoryAddress = deployment.contracts.factory.address
const feeVaultAddress = deployment.contracts.feeVault.address
const registryAddress = deployment.contracts.registry.address
const owner = deployment.protocolOwner
const treasury = deployment.treasury

const contracts = [
  {
    sourceName: 'RHBurnerPassFactoryV2.sol',
    contractName: 'RHBurnerPassFactoryV2',
    address: factoryAddress,
    txHash: deployment.contracts.factory.deploymentTx,
    args: [owner],
    argTypes: [{ type: 'address' }],
  },
  {
    sourceName: 'RHBurnerPassFeeVaultV3.sol',
    contractName: 'RHBurnerPassFeeVaultV3',
    address: feeVaultAddress,
    txHash: deployment.contracts.feeVault.deploymentTx,
    args: [treasury, factoryAddress],
    argTypes: [{ type: 'address' }, { type: 'address' }],
  },
  {
    sourceName: 'RHBurnerPassRegistryV3.sol',
    contractName: 'RHBurnerPassRegistryV3',
    address: registryAddress,
    txHash: deployment.contracts.registry.deploymentTx,
    args: [factoryAddress],
    argTypes: [{ type: 'address' }],
  },
]

fs.mkdirSync(verificationDir, { recursive: true })
const compilerVersionRaw = solc.version()
const compilerVersion = `v${compilerVersionRaw.split('.Emscripten')[0]}`
const standardInputText = JSON.stringify(input, null, 2) + '\n'
const manifest = {
  network: 'Robinhood Chain Testnet',
  chainId: 46630,
  compilerVersion,
  optimizer: { enabled: true, runs: 200 },
  contracts: [],
}

console.log('\nRHBurnerPass v2 — source verification')
console.log(`Network: Robinhood Chain Testnet (${actualChainId})`)
console.log(`Compiler: ${compilerVersion}`)
console.log('Optimizer: enabled, runs 200')

for (const item of contracts) {
  const compiled = output.contracts?.[item.sourceName]?.[item.contractName]
  if (!compiled) throw new Error(`Compilation output missing for ${item.sourceName}:${item.contractName}`)
  const abi = compiled.abi
  const bytecode = `0x${compiled.evm.bytecode.object}`
  const expectedDeployData = encodeDeployData({ abi, bytecode, args: item.args })
  const tx = await client.getTransaction({ hash: item.txHash })
  if (tx.input.toLowerCase() !== expectedDeployData.toLowerCase()) {
    throw new Error(`${item.contractName}: local compiler input does NOT reproduce deployment tx ${item.txHash}. Refusing verification submission.`)
  }
  const constructorArgs = encodeAbiParameters(item.argTypes, item.args).slice(2)
  const outFile = path.join(verificationDir, `${item.contractName}-standard-input.json`)
  fs.writeFileSync(outFile, standardInputText)
  manifest.contracts.push({
    contractName: item.contractName,
    sourceName: item.sourceName,
    address: item.address,
    deploymentTx: item.txHash,
    constructorArgs,
    standardInputFile: path.relative(root, outFile).replaceAll('\\', '/'),
    deployDataMatch: true,
  })
  console.log(`PASS: ${item.contractName} creation bytecode exactly matches its deployed transaction`)
}

const manifestFile = path.join(verificationDir, 'manifest.json')
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
console.log(`Saved reproducible inputs under ${path.relative(root, verificationDir)}`)

const explorerBase = 'https://explorer.testnet.chain.robinhood.com'

async function isVerified(address) {
  const response = await fetch(`${explorerBase}/api/v2/smart-contracts/${address}`)
  if (!response.ok) return false
  const body = await response.json().catch(() => null)
  return Boolean(body?.is_verified || body?.is_fully_verified)
}

async function submit(item) {
  if (await isVerified(item.address)) {
    console.log(`ALREADY VERIFIED: ${item.contractName} ${item.address}`)
    return
  }
  const form = new FormData()
  form.append('compiler_version', compilerVersion)
  form.append('contract_name', item.contractName)
  form.append('autodetect_constructor_args', 'false')
  form.append('constructor_args', item.constructorArgs)
  form.append('license_type', 'mit')
  form.append('files[0]', new Blob([standardInputText], { type: 'application/json' }), `${item.contractName}-standard-input.json`)

  const response = await fetch(`${explorerBase}/api/v2/smart-contracts/${item.address}/verification/via/standard-input`, {
    method: 'POST',
    body: form,
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${item.contractName}: Blockscout submission failed (${response.status}) ${text}`)
  }
  console.log(`SUBMITTED: ${item.contractName} ${item.address}`)

  for (let attempt = 1; attempt <= 12; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2500))
    if (await isVerified(item.address)) {
      console.log(`VERIFIED: ${item.contractName} ${item.address}`)
      return
    }
  }
  console.log(`PENDING: ${item.contractName} was submitted but Blockscout has not marked it verified yet.`)
}

for (const item of manifest.contracts) await submit(item)

console.log('\nVerification helper finished.')
console.log('No private key was read and no blockchain transaction was signed or sent.')
console.log(`Explorer: ${explorerBase}`)

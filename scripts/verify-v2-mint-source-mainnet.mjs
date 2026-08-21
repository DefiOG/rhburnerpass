import fs from 'node:fs'
import path from 'node:path'
import solc from 'solc'
import {
  createPublicClient,
  defineChain,
  encodeAbiParameters,
  http,
  isAddress,
  parseEther,
} from 'viem'

const root = process.cwd()
const contractsDir = path.join(root, 'contracts')
const mintRoot = path.join(root, 'mint-deployments')

const explorerBase = 'https://robinhoodchain.blockscout.com'
const rpc = process.env.RH_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'

if (/testnet/i.test(rpc)) {
  throw new Error('RPC looks like testnet; refusing mainnet verification.')
}

const requested = process.argv[2]?.trim()
let mintAddress =
  requested || '0xCA371B745edF27C090a7C5DA4e379a3b3e392284'

if (!isAddress(mintAddress)) {
  throw new Error(`Invalid mint address: ${mintAddress}`)
}

const mintDir = path.join(mintRoot, mintAddress)
const configFile = path.join(mintDir, 'mint-config.json')

if (!fs.existsSync(configFile)) {
  throw new Error(`Missing ${configFile}`)
}

const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))

if (Number(config.chainId) !== 4663) {
  throw new Error('Mint config is not Robinhood Chain Mainnet (4663).')
}

if (config.mintAddress.toLowerCase() !== mintAddress.toLowerCase()) {
  throw new Error('Mint address does not match mint-config.json.')
}

const factory = process.env.RHBP_V2_FACTORY_ADDRESS || config.factory
const registry = process.env.RHBP_V2_REGISTRY_ADDRESS
const feeVault = process.env.RHBP_V2_FEE_VAULT_ADDRESS

if (!factory || !isAddress(factory)) {
  throw new Error('Set RHBP_V2_FACTORY_ADDRESS in .env.mainnet.')
}

if (!registry || !isAddress(registry)) {
  throw new Error('Set RHBP_V2_REGISTRY_ADDRESS in .env.mainnet.')
}

if (!feeVault || !isAddress(feeVault)) {
  throw new Error('Set RHBP_V2_FEE_VAULT_ADDRESS in .env.mainnet.')
}

if (config.factory.toLowerCase() !== factory.toLowerCase()) {
  throw new Error(
    'Mint config Factory does not match RHBP_V2_FACTORY_ADDRESS.'
  )
}

const chain = defineChain({
  id: 4663,
  name: 'Robinhood Chain Mainnet',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [rpc],
    },
  },
})

const client = createPublicClient({
  chain,
  transport: http(rpc),
})

const actualChainId = await client.getChainId()

if (actualChainId !== 4663) {
  throw new Error(
    `RPC chain mismatch; expected 4663, got ${actualChainId}.`
  )
}

const code = await client.getCode({
  address: mintAddress,
})

if (!code || code === '0x') {
  throw new Error(`No contract code found at ${mintAddress}.`)
}

const mintViewAbi = [
  {
    type: 'function',
    name: 'rhBurnerPassFactory',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'rhBurnerPassRegistry',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'rhBurnerPassFeeVault',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'merkleRoot',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'mintPrice',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'maxSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'projectTreasury',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'baseTokenURI',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
]

const reads = await Promise.all(
  [
    'rhBurnerPassFactory',
    'rhBurnerPassRegistry',
    'rhBurnerPassFeeVault',
    'merkleRoot',
    'mintPrice',
    'maxSupply',
    'projectTreasury',
    'baseTokenURI',
    'name',
    'symbol',
  ].map((functionName) =>
    client.readContract({
      address: mintAddress,
      abi: mintViewAbi,
      functionName,
    })
  )
)

const [
  onFactory,
  onRegistry,
  onFeeVault,
  onRoot,
  onPrice,
  onSupply,
  onTreasury,
  onBaseUri,
  onName,
  onSymbol,
] = reads

const expectedPrice = parseEther(config.mintPriceEth)
const expectedSupply = BigInt(config.maxSupply)

const checks = [
  ['Factory', onFactory.toLowerCase() === factory.toLowerCase()],
  ['Registry', onRegistry.toLowerCase() === registry.toLowerCase()],
  ['FeeVault', onFeeVault.toLowerCase() === feeVault.toLowerCase()],
  ['Merkle root', onRoot.toLowerCase() === config.merkleRoot.toLowerCase()],
  ['Mint price', onPrice === expectedPrice],
  ['Max supply', onSupply === expectedSupply],
  [
    'Project treasury',
    onTreasury.toLowerCase() === config.projectTreasury.toLowerCase(),
  ],
  ['Base metadata URI', onBaseUri === config.baseTokenURI],
  ['Collection name', onName === config.name],
  ['Symbol', onSymbol === config.symbol],
]

for (const [label, ok] of checks) {
  if (!ok) {
    throw new Error(`${label} does not match saved mint-config.json.`)
  }
}

const factoryArtifact = JSON.parse(
  fs.readFileSync(
    path.join(root, 'artifacts', 'RHBurnerPassFactoryV2.json'),
    'utf8'
  )
)

const integration = await client.readContract({
  address: factory,
  abi: factoryArtifact.abi,
  functionName: 'integrationInfo',
  args: [mintAddress],
})

const [integrationOwner, payout, blocked, official] = integration

if (!official || blocked) {
  throw new Error(
    'Factory does not currently report this mint as an active canonical integration.'
  )
}

if (
  integrationOwner.toLowerCase() !==
  config.integrationOwner.toLowerCase()
) {
  throw new Error(
    'Factory integration owner does not match mint-config.json.'
  )
}

if (
  payout.toLowerCase() !==
  config.partnerPayout.toLowerCase()
) {
  throw new Error(
    'Factory partner payout does not match mint-config.json. If you intentionally changed payout after deployment, update the saved config first.'
  )
}

console.log(
  '\nRHBurnerPass v2 — canonical mint source verification'
)
console.log(
  `Network: Robinhood Chain Mainnet (${actualChainId})`
)
console.log(`Mint: ${mintAddress}`)
console.log(
  'PASS: saved mint configuration matches live on-chain constructor state'
)
console.log(
  'PASS: Factory reports mint as canonical and partner-bound'
)

const sources = Object.fromEntries(
  fs
    .readdirSync(contractsDir)
    .filter((name) => name.endsWith('.sol'))
    .sort()
    .map((name) => [
      name,
      {
        content: fs.readFileSync(
          path.join(contractsDir, name),
          'utf8'
        ),
      },
    ])
)

const importRe =
  /^\s*import\s+(?:(?:[^'"]*?\s+from\s+)?["']([^"']+)["'])\s*;/gm

const nodeModulesDir = path.join(root, 'node_modules')

function normalizeSourceName(importer, specifier) {
  if (specifier.startsWith('@')) {
    return path.posix.normalize(specifier)
  }

  if (specifier.startsWith('.')) {
    return path.posix.normalize(
      path.posix.join(
        path.posix.dirname(importer),
        specifier
      )
    )
  }

  return path.posix.normalize(specifier)
}

function diskPathFor(sourceName) {
  if (sourceName.startsWith('@')) {
    return path.join(
      nodeModulesDir,
      ...sourceName.split('/')
    )
  }

  return path.join(
    contractsDir,
    ...sourceName.split('/')
  )
}

function addImports(sourceName) {
  const entry = sources[sourceName]

  if (!entry) {
    throw new Error(`Missing source entry: ${sourceName}`)
  }

  importRe.lastIndex = 0
  let match

  while ((match = importRe.exec(entry.content)) !== null) {
    const childName = normalizeSourceName(
      sourceName,
      match[1]
    )

    if (!sources[childName]) {
      const file = diskPathFor(childName)

      if (!fs.existsSync(file)) {
        throw new Error(
          `Import not found: ${childName} -> ${file}`
        )
      }

      sources[childName] = {
        content: fs.readFileSync(file, 'utf8'),
      }

      addImports(childName)
    }
  }
}

for (const sourceName of Object.keys(sources)) {
  addImports(sourceName)
}

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object'],
      },
    },
  },
}

const output = JSON.parse(
  solc.compile(JSON.stringify(input))
)

const errors = (output.errors || []).filter(
  (e) => e.severity === 'error'
)

if (errors.length) {
  for (const error of errors) {
    console.error(error.formattedMessage)
  }

  process.exit(1)
}

const compiled =
  output.contracts?.['RHBurnerPassMintTemplateV2.sol']
    ?.RHBurnerPassMintTemplateV2

if (!compiled) {
  throw new Error(
    'Compilation output missing RHBurnerPassMintTemplateV2.'
  )
}

const args = [
  factory,
  registry,
  feeVault,
  config.name,
  config.symbol,
  config.merkleRoot,
  expectedPrice,
  expectedSupply,
  config.projectTreasury,
  config.baseTokenURI,
]

const argTypes = [
  { type: 'address' },
  { type: 'address' },
  { type: 'address' },
  { type: 'string' },
  { type: 'string' },
  { type: 'bytes32' },
  { type: 'uint256' },
  { type: 'uint256' },
  { type: 'address' },
  { type: 'string' },
]

const constructorArgs = encodeAbiParameters(
  argTypes,
  args
).slice(2)

const compilerVersion =
  `v${solc.version().split('.Emscripten')[0]}`

const standardInputText =
  JSON.stringify(input, null, 2) + '\n'

const outDir = path.join(
  root,
  'verification',
  'v2-mainnet-mint',
  mintAddress
)

fs.mkdirSync(outDir, {
  recursive: true,
})

fs.writeFileSync(
  path.join(
    outDir,
    'RHBurnerPassMintTemplateV2-standard-input.json'
  ),
  standardInputText
)

fs.writeFileSync(
  path.join(outDir, 'manifest.json'),
  JSON.stringify(
    {
      network: 'Robinhood Chain Mainnet',
      chainId: 4663,
      compilerVersion,
      optimizer: {
        enabled: true,
        runs: 200,
      },
      contractName: 'RHBurnerPassMintTemplateV2',
      sourceName: 'RHBurnerPassMintTemplateV2.sol',
      address: mintAddress,
      constructorArgs,
      mintConfig: path
        .relative(root, configFile)
        .replaceAll('\\', '/'),
    },
    null,
    2
  ) + '\n'
)

console.log(`Compiler: ${compilerVersion}`)
console.log(
  `Saved reproducible verification input under ${path.relative(
    root,
    outDir
  )}`
)

async function isVerified(address) {
  const response = await fetch(
    `${explorerBase}/api/v2/smart-contracts/${address}`
  )

  if (!response.ok) {
    return false
  }

  const body = await response
    .json()
    .catch(() => null)

  return Boolean(
    body?.is_verified ||
    body?.is_fully_verified
  )
}

if (await isVerified(mintAddress)) {
  console.log(
    `ALREADY VERIFIED: RHBurnerPassMintTemplateV2 ${mintAddress}`
  )
} else {
  const form = new FormData()

  form.append(
    'compiler_version',
    compilerVersion
  )
  form.append(
    'contract_name',
    'RHBurnerPassMintTemplateV2'
  )
  form.append(
    'autodetect_constructor_args',
    'false'
  )
  form.append(
    'constructor_args',
    constructorArgs
  )
  form.append(
    'license_type',
    'mit'
  )
  form.append(
    'files[0]',
    new Blob(
      [standardInputText],
      {
        type: 'application/json',
      }
    ),
    'RHBurnerPassMintTemplateV2-standard-input.json'
  )

  const response = await fetch(
    `${explorerBase}/api/v2/smart-contracts/${mintAddress}/verification/via/standard-input`,
    {
      method: 'POST',
      body: form,
    }
  )

  const text = await response.text()

  if (!response.ok) {
    throw new Error(
      `Blockscout submission failed (${response.status}) ${text}`
    )
  }

  console.log(
    `SUBMITTED: RHBurnerPassMintTemplateV2 ${mintAddress}`
  )

  let verified = false

  for (let attempt = 1; attempt <= 12; attempt++) {
    await new Promise((resolve) =>
      setTimeout(resolve, 2500)
    )

    if (await isVerified(mintAddress)) {
      verified = true
      break
    }
  }

  if (verified) {
    console.log(
      `VERIFIED: RHBurnerPassMintTemplateV2 ${mintAddress}`
    )
  } else {
    console.log(
      'PENDING: Blockscout accepted the submission but has not marked it verified yet.'
    )
  }
}

console.log('\nMint verification helper finished.')
console.log(
  'No private key was read and no blockchain transaction was signed or sent.'
)
console.log(`Explorer: ${explorerBase}`)
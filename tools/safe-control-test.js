import Safe from '@safe-global/protocol-kit'

const SAFE = '0xA70bDD510A6D339318FdBCaFb60862FDD39AbA0b'
const TEST_TARGET = '0x42A6ED4FEfffc4D0f12312453e6E36d42A1Eb16B'
const CHAIN_ID = 4663
const CHAIN_HEX = '0x1237'
const OWNERS = [
  '0xeec6244D9FBCE601ce824A9594238e9C9b3770bE',
  '0x2966c9Bb3eF150db20387f3eD5ab15DD2a7b2f29',
  '0x980Ea39f124FdC7c79e7975280C1cc8Bf352C5C5',
]
const ownerSet = new Set(OWNERS.map((x) => x.toLowerCase()))

const expectedEl = document.querySelector('#expected')
const walletsEl = document.querySelector('#wallets')
const connectedEl = document.querySelector('#connected')
const txEl = document.querySelector('#tx')
const signatureEl = document.querySelector('#signature')
const signBtn = document.querySelector('#sign')
const copy1Btn = document.querySelector('#copy1')
const copy2Btn = document.querySelector('#copy2')

expectedEl.textContent = [
  `Chain ID: ${CHAIN_ID}`,
  `Safe: ${SAFE}`,
  `Threshold: 2 of 3`,
  `Owners:`,
  ...OWNERS.map((o, i) => `  ${i + 1}. ${o}`),
  '',
  `Harmless test target: ${TEST_TARGET}`,
  `Value: 0 ETH`,
  `Data: 0x`,
].join('\n')

let current = null
let signature = null
let txHash = null

const providers = new Map()

function renderProviders() {
  walletsEl.innerHTML = ''
  if (!providers.size) {
    walletsEl.textContent = 'No EIP-6963 wallet announced yet.'
    return
  }
  for (const [id, detail] of providers) {
    const row = document.createElement('div')
    row.className = 'wallet'
    const button = document.createElement('button')
    button.textContent = `Connect ${detail.info?.name || 'wallet'}`
    button.onclick = () => connectProvider(detail)
    row.appendChild(button)
    walletsEl.appendChild(row)
  }
}

function addProvider(detail) {
  const id = detail.info?.uuid || detail.info?.rdns || detail.info?.name || String(providers.size)
  if (!providers.has(id)) {
    providers.set(id, detail)
    renderProviders()
  }
}

window.addEventListener('eip6963:announceProvider', (event) => addProvider(event.detail))
window.dispatchEvent(new Event('eip6963:requestProvider'))

setTimeout(() => {
  if (!providers.size && window.ethereum) {
    addProvider({
      info: { uuid: 'window.ethereum', name: 'Injected wallet' },
      provider: window.ethereum,
    })
  }
}, 800)

async function ensureRobinhoodChain(provider) {
  let chain = await provider.request({ method: 'eth_chainId' })
  if (Number(BigInt(chain)) === CHAIN_ID) return

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_HEX }],
    })
  } catch (error) {
    if (error?.code !== 4902) throw error
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: CHAIN_HEX,
        chainName: 'Robinhood Chain',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
        blockExplorerUrls: ['https://robinhoodchain.blockscout.com'],
      }],
    })
  }

  chain = await provider.request({ method: 'eth_chainId' })
  if (Number(BigInt(chain)) !== CHAIN_ID) {
    throw new Error(`Wallet is on chain ${Number(BigInt(chain))}, expected ${CHAIN_ID}.`)
  }
}

async function requestFreshMetaMaskAccount(detail) {
  const provider = detail.provider
  const isMetaMask = /metamask/i.test(detail.info?.name || '') || detail.info?.rdns === 'io.metamask'

  if (!isMetaMask) {
    return provider.request({ method: 'eth_requestAccounts' })
  }

  // MetaMask-specific permission reset for this localhost origin.
  // This avoids depending on where MetaMask currently places its dapp-permission UI.
  try {
    await provider.request({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }],
    })
  } catch (error) {
    console.warn('MetaMask permission revoke was unavailable or unnecessary:', error)
  }

  await provider.request({
    method: 'wallet_requestPermissions',
    params: [{ eth_accounts: {} }],
  })

  return provider.request({ method: 'eth_accounts' })
}

async function connectProvider(detail) {
  signature = null
  txHash = null
  signBtn.disabled = true
  copy1Btn.disabled = true
  copy2Btn.disabled = true
  signatureEl.textContent = 'No signature yet.'

  const provider = detail.provider
  await ensureRobinhoodChain(provider)

  const accounts = await requestFreshMetaMaskAccount(detail)
  const account = accounts?.[0]
  if (!account) throw new Error('Wallet returned no account.')

  if (!ownerSet.has(account.toLowerCase())) {
    connectedEl.textContent = `Connected: ${account}\nNOT one of the three Safe owners.`
    throw new Error('Connected wallet is not a Safe owner.')
  }

  const kit = await Safe.init({
    provider,
    signer: account,
    safeAddress: SAFE,
  })

  const [onchainOwners, threshold] = await Promise.all([
    kit.getOwners(),
    kit.getThreshold(),
  ])

  const safeTransaction = await kit.createTransaction({
    transactions: [{
      to: TEST_TARGET,
      value: '0',
      data: '0x',
    }],
  })
  const hash = await kit.getTransactionHash(safeTransaction)

  current = { detail, provider, account, kit, safeTransaction }
  txHash = hash

  connectedEl.textContent = [
    `Wallet: ${detail.info?.name || 'Injected wallet'}`,
    `Owner: ${account}`,
    `Chain ID: ${CHAIN_ID}`,
    `Safe threshold read on-chain: ${threshold}`,
    `Safe owners read on-chain:`,
    ...onchainOwners.map((o) => `  ${o}`),
  ].join('\n')

  txEl.textContent = [
    `Safe transaction hash: ${hash}`,
    `Safe nonce: ${safeTransaction.data.nonce}`,
    `To: ${safeTransaction.data.to}`,
    `Value: ${safeTransaction.data.value} wei`,
    `Data: ${safeTransaction.data.data}`,
    `Operation: ${safeTransaction.data.operation}`,
    '',
    'This is a 0-value / no-calldata test transaction.',
  ].join('\n')

  signBtn.disabled = false
}

signBtn.onclick = async () => {
  if (!current) return
  const signed = await current.kit.signTypedData(current.safeTransaction, 'v4')
  signature = signed.data
  signatureEl.textContent = [
    `Signer: ${current.account}`,
    `Safe tx hash: ${txHash}`,
    `Signature: ${signature}`,
    '',
    'Signing completed. The Safe transaction has NOT been executed.',
  ].join('\n')
  copy1Btn.disabled = false
  copy2Btn.disabled = false
}

async function copyEnv(slot) {
  if (!signature || !current || !txHash) return
  const block = [
    `SAFE_TEST_TX_HASH=${txHash}`,
    `SAFE_TEST_SIGNER_${slot}=${current.account}`,
    `SAFE_TEST_SIGNATURE_${slot}=${signature}`,
  ].join('\n')
  await navigator.clipboard.writeText(block)
  alert(`Copied signature ${slot} env block. Paste it into .env.mainnet locally.`)
}

copy1Btn.onclick = () => copyEnv(1)
copy2Btn.onclick = () => copyEnv(2)

window.addEventListener('unhandledrejection', (event) => {
  alert(event.reason?.message || String(event.reason))
})

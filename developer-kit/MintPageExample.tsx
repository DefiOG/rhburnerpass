import { useState } from 'react'
import { createPublicClient, http, parseAbi, type Address, type Hex, type WalletClient } from 'viem'
const mintAbi = parseAbi([
  'function mint(address vault,uint256 maxAllocation,uint256 quantity,bytes32[] proof) payable',
  'function mintPrice() view returns (uint256)',
  'function rhBurnerPassFee(address caller,address vault,uint256 quantity) view returns (uint256)',
  'function claimedByVault(address vault) view returns (uint256)',
])
export function MintPageExample(props: { wallet: WalletClient; rpcUrl: string; mint: Address; burner: Address; vault: Address; maxAllocation: bigint; proof: Hex[] }) {
  const [status, setStatus] = useState('Ready')
  const publicClient = createPublicClient({ transport: http(props.rpcUrl) })
  async function mintOne() {
    const quantity = 1n
    setStatus('Quoting…')
    const [price, fee] = await Promise.all([
      publicClient.readContract({ address: props.mint, abi: mintAbi, functionName: 'mintPrice' }),
      publicClient.readContract({ address: props.mint, abi: mintAbi, functionName: 'rhBurnerPassFee', args: [props.burner, props.vault, quantity] }),
    ])
    setStatus('Confirm in burner wallet…')
    const hash = await props.wallet.writeContract({ account: props.burner, address: props.mint, abi: mintAbi, functionName: 'mint', args: [props.vault, props.maxAllocation, quantity, props.proof], value: price * quantity + fee })
    setStatus(`Submitted: ${hash}`)
  }
  return <button onClick={mintOne}>{status === 'Ready' ? 'Mint with burner' : status}</button>
}

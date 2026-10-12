import { useCallback, useState } from 'react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  formatEther,
  formatUnits,
  http,
  isAddress,
  keccak256,
  parseEther,
  parseUnits,
  toBytes,
  type Address,
  type Hash,
} from 'viem'
declare global {
  interface Window {
    ethereum?: {
      request: (args: {
        method: string
        params?: unknown[] | object
      }) => Promise<unknown>
    }
  }
}
const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
  blockExplorers: {
    default: {
      name: 'Monad Explorer',
      url: 'https://testnet.monadexplorer.com',
    },
  },
  testnet: true,
})
const TOKEN_ADDRESS =
  '0xee512b0e69e0ce4b2ab216a42ba8025834f930b3' as Address
const TOKEN_MANAGER_ROLE = keccak256(toBytes('TOKEN_MANAGER_ROLE'))
const tokenAbi = [
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
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'hasRole',
    stateMutability: 'view',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'delegate',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'delegatee', type: 'address' }],
    outputs: [],
  },
] as const
const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http('https://testnet-rpc.monad.xyz'),
})
function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}
export default function WalletPanel() {
  const [address, setAddress] = useState<Address | null>(null)
  const [nativeBalance, setNativeBalance] = useState<string | null>(null)
  const [tokenBalance, setTokenBalance] = useState<string | null>(null)
  const [canMint, setCanMint] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [sendAmount, setSendAmount] = useState('0.001')
  const [mintAmount, setMintAmount] = useState('100')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [txHash, setTxHash] = useState<Hash | null>(null)
  const refreshBalances = useCallback(async (account: Address) => {
    const [wei, rawTokenBalance, managerRole] = await Promise.all([
      publicClient.getBalance({ address: account }),
      publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: tokenAbi,
        functionName: 'balanceOf',
        args: [account],
      }),
      publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: tokenAbi,
        functionName: 'hasRole',
        args: [TOKEN_MANAGER_ROLE, account],
      }),
    ])
    setNativeBalance(
      Number(formatEther(wei)).toLocaleString(undefined, {
        maximumFractionDigits: 6,
      }),
    )
    setTokenBalance(
      formatUnits(rawTokenBalance, 18),
    )
    setCanMint(managerRole)
  }, [])
  async function getWalletClient() {
    const provider = window.ethereum
    if (!provider) {
      throw new Error('MetaMask was not detected. Install or unlock it first.')
    }
    let chainId = await provider.request({ method: 'eth_chainId' })
    if (String(chainId).toLowerCase() !== '0x279f') {
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x279f' }],
        })
      } catch (switchError) {
        if ((switchError as { code?: number }).code !== 4902) {
          throw switchError
        }
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0x279f',
            chainName: 'Monad Testnet',
            nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
            rpcUrls: ['https://testnet-rpc.monad.xyz'],
            blockExplorerUrls: ['https://testnet.monadexplorer.com'],
          }],
        })
      }
      chainId = await provider.request({ method: 'eth_chainId' })
      if (String(chainId).toLowerCase() !== '0x279f') {
        throw new Error('Switch MetaMask to Monad Testnet before continuing.')
      }
    }
    return createWalletClient({
      chain: monadTestnet,
      transport: custom(provider as never),
    })
  }
  async function connectWallet() {
    setError('')
    setNotice('')
    setTxHash(null)
    setBusy(true)
    try {
      const wallet = await getWalletClient()
      const accounts = await wallet.requestAddresses()
      const selected = accounts[0]
      if (!selected) throw new Error('No wallet account was selected.')
      setAddress(selected)
      await refreshBalances(selected)
      setNotice('Wallet connected to Monad Testnet.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Wallet connection failed.')
    } finally {
      setBusy(false)
    }
  }
  async function sendNativeMon() {
    setError('')
    setNotice('')
    setTxHash(null)
    if (!address) {
      setError('Connect MetaMask first.')
      return
    }
    if (!isAddress(recipient)) {
      setError('Enter a valid recipient address.')
      return
    }
    let value: bigint
    try {
      value = parseEther(sendAmount)
      if (value <= 0n) throw new Error('Amount must be greater than zero.')
    } catch {
      setError('Enter a valid positive MON amount.')
      return
    }
    setBusy(true)
    try {
      const wallet = await getWalletClient()
      const accounts = await wallet.requestAddresses()
      if (accounts[0]?.toLowerCase() !== address.toLowerCase()) {
        throw new Error('The active MetaMask account changed. Reconnect first.')
      }
      const hash = await wallet.sendTransaction({
        account: address,
        chain: monadTestnet,
        to: recipient as Address,
        value,
      })
      setTxHash(hash)
      setNotice('Transaction submitted. Waiting for Monad Testnet confirmation…')
      await publicClient.waitForTransactionReceipt({ hash })
      await refreshBalances(address)
      setNotice('MON transfer confirmed on Monad Testnet.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'MON transfer failed.')
    } finally {
      setBusy(false)
    }
  }
  async function mintTestTokens() {
    setError('')
    setNotice('')
    setTxHash(null)
    if (!address) {
      setError('Connect MetaMask first.')
      return
    }
    if (!canMint) {
      setError('This wallet does not have TOKEN_MANAGER_ROLE.')
      return
    }
    let amount: bigint
    try {
      amount = parseUnits(mintAmount, 18)
      if (amount <= 0n) throw new Error('Amount must be positive.')
    } catch {
      setError('Enter a valid positive TCYGPU amount.')
      return
    }
    setBusy(true)
    try {
      const wallet = await getWalletClient()
      const accounts = await wallet.requestAddresses()
      if (accounts[0]?.toLowerCase() !== address.toLowerCase()) {
        throw new Error('The active MetaMask account changed. Reconnect first.')
      }
      const hash = await wallet.writeContract({
        account: address,
        chain: monadTestnet,
        address: TOKEN_ADDRESS,
        abi: tokenAbi,
        functionName: 'mint',
        args: [address, amount],
      })
      setTxHash(hash)
      setNotice('Mint submitted. Waiting for confirmation…')
      await publicClient.waitForTransactionReceipt({ hash })
      await refreshBalances(address)
      setNotice('TCYGPU mint confirmed.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Token mint failed.')
    } finally {
      setBusy(false)
    }
  }
  async function delegateVotingPower() {
    setError('')
    setNotice('')
    setTxHash(null)
    if (!address) {
      setError('Connect MetaMask first.')
      return
    }
    setBusy(true)
    try {
      const wallet = await getWalletClient()
      const accounts = await wallet.requestAddresses()
      if (accounts[0]?.toLowerCase() !== address.toLowerCase()) {
        throw new Error('The active MetaMask account changed. Reconnect first.')
      }
      const hash = await wallet.writeContract({
        account: address,
        chain: monadTestnet,
        address: TOKEN_ADDRESS,
        abi: tokenAbi,
        functionName: 'delegate',
        args: [address],
      })
      setTxHash(hash)
      setNotice('Delegation submitted. Waiting for confirmation…')
      await publicClient.waitForTransactionReceipt({ hash })
      await refreshBalances(address)
      setNotice('Voting power delegated to your own wallet.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Delegation failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section style={{
      display: 'grid',
      gap: 14,
      padding: 18,
      margin: '12px 0',
      border: '1px solid #34384a',
      borderRadius: 14,
      background: '#171a26',
      color: '#f5f6ff',
    }}>
      <div>
        <strong>Wallet & Transactions · Monad Testnet</strong>
        <p style={{ color: '#a8adc4', fontSize: 13, marginBottom: 0 }}>
          {address
            ? `${shortAddress(address)} · ${nativeBalance ?? '…'} MON · ${tokenBalance ?? '…'} TCYGPU`
            : 'Connect MetaMask to read balances and submit transactions.'}
        </p>
      </div>
      {!address ? (
        <button type="button" disabled={busy} onClick={() => void connectWallet()}>
          {busy ? 'Connecting…' : 'Connect MetaMask'}
        </button>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" disabled={busy} onClick={() => void refreshBalances(address)}>
              Refresh balances
            </button>
            <button type="button" disabled={busy} onClick={() => void delegateVotingPower()}>
              Delegate voting power to self
            </button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <strong>Send testnet MON</strong>
            <input
              aria-label="Recipient wallet address"
              placeholder="0x recipient address"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <input
              aria-label="MON amount"
              type="number"
              min="0"
              step="0.001"
              value={sendAmount}
              onChange={(event) => setSendAmount(event.target.value)}
            />
            <button type="button" disabled={busy} onClick={() => void sendNativeMon()}>
              {busy ? 'Processing…' : 'Send MON'}
            </button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <strong>TCYGPU token administration</strong>
            {canMint ? (
              <>
                <p style={{ color: '#a8adc4', fontSize: 13, margin: 0 }}>
                  This wallet has TOKEN_MANAGER_ROLE. Mint only testnet tokens for testing.
                </p>
                <input
                  aria-label="TCYGPU mint amount"
                  type="number"
                  min="0"
                  step="1"
                  value={mintAmount}
                  onChange={(event) => setMintAmount(event.target.value)}
                />
                <button type="button" disabled={busy} onClick={() => void mintTestTokens()}>
                  {busy ? 'Processing…' : 'Mint TCYGPU to connected wallet'}
                </button>
              </>
            ) : (
              <p style={{ color: '#a8adc4', fontSize: 13, margin: 0 }}>
                Current wallet does not have TOKEN_MANAGER_ROLE. Minting is disabled.
              </p>
            )}
            <a
              href={`https://testnet.monadexplorer.com/address/${TOKEN_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#b6a8ff' }}
            >
              View TCYGPU contract on Explorer ↗
            </a>
          </div>
        </>
      )}
      {error && <p role="alert" style={{ color: '#ff9caa', margin: 0 }}>{error}</p>}
      {notice && <p role="status" style={{ color: '#a6e3b0', margin: 0 }}>{notice}</p>}
      {txHash && (
        <a
          href={`https://testnet.monadexplorer.com/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: '#b6a8ff', overflowWrap: 'anywhere' }}
        >
          View transaction: {shortAddress(txHash)} ↗
        </a>
      )}
    </section>
  )
}
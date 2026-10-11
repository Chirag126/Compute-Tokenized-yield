import { useEffect, useState } from 'react'
import { createPublicClient, createWalletClient, custom, defineChain, isAddress, parseEther, type Address } from 'viem'

const monad = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'Monad Explorer', url: 'https://testnet.monadexplorer.com' } },
})

const explorer = 'https://testnet.monadexplorer.com/tx/'

export default function TransactionPanel() {
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('0.01')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [txHash, setTxHash] = useState('')
  const [error, setError] = useState('')
  const [account, setAccount] = useState<Address | null>(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    const provider = window.ethereum as (typeof window.ethereum & { on?: (event: string, listener: (...args: unknown[]) => void) => void; removeListener?: (event: string, listener: (...args: unknown[]) => void) => void }) | undefined
    if (!provider) return

    const syncAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[]
      setAccount(accounts?.[0] ? accounts[0] as Address : null)
    }

    void provider.request({ method: 'eth_accounts' })
      .then((accounts) => setAccount((accounts as Address[])[0] ?? null))
      .catch(() => setAccount(null))

    provider.on?.('accountsChanged', syncAccounts)
    return () => provider.removeListener?.('accountsChanged', syncAccounts)
  }, [])

  async function connectWallet() {
    setError('')
    setMessage('')
    if (!window.ethereum) {
      setError('MetaMask was not detected. Install or unlock MetaMask first.')
      return
    }

    setConnecting(true)
    try {
      const provider = window.ethereum
      let chainId = await provider.request({ method: 'eth_chainId' }) as string

      if (Number(chainId) !== monad.id) {
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x279f' }],
          })
        } catch (switchError) {
          if ((switchError as { code?: number }).code !== 4902) throw switchError
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
        chainId = await provider.request({ method: 'eth_chainId' }) as string
      }

      if (Number(chainId) !== monad.id) throw new Error('Please switch MetaMask to Monad Testnet.')
      const wallet = createWalletClient({ chain: monad, transport: custom(provider as never) })
      const accounts = await wallet.requestAddresses()
      if (!accounts[0]) throw new Error('No wallet account was selected.')
      setAccount(accounts[0])
      setMessage('Wallet connected to Monad Testnet.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Wallet connection failed.')
    } finally {
      setConnecting(false)
    }
  }

  async function sendTestTransaction() {
    setError('')
    setMessage('')
    setTxHash('')

    if (!window.ethereum) {
      setError('MetaMask was not detected. Install or unlock MetaMask first.')
      return
    }
    if (!isAddress(recipient)) {
      setError('Enter a valid recipient wallet address.')
      return
    }

    let value: bigint
    try {
      value = parseEther(amount)
      if (value <= 0n) throw new Error('Amount must be greater than zero.')
    } catch {
      setError('Enter a valid MON amount greater than zero.')
      return
    }

    if (!account) {
      setError('Connect your wallet first.')
      return
    }

    if (!window.confirm(`Send ${amount} MON on Monad Testnet to ${recipient}? Check the recipient and amount in MetaMask before confirming.`)) return

    setBusy(true)
    try {
      const provider = window.ethereum
      const chainId = await provider.request({ method: 'eth_chainId' }) as string
      if (Number(chainId) !== monad.id) throw new Error('Switch MetaMask to Monad Testnet first.')

      const wallet = createWalletClient({ chain: monad, transport: custom(provider as never) })
      const hash = await wallet.sendTransaction({
        account,
        to: recipient as Address,
        value,
        chain: monad,
      })

      setTxHash(hash)
      setMessage('Transaction submitted. Waiting for network confirmation…')

      const publicClient = createPublicClient({
        chain: monad,
        transport: custom(provider as never),
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      setMessage(receipt.status === 'success'
        ? `Confirmed in block ${receipt.blockNumber.toString()}.`
        : 'The transaction was included but reverted.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Transaction failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{ padding: 16, margin: '12px 0', border: '1px solid #34384a', borderRadius: 14, background: '#171a26', color: '#f5f6ff' }}>
      <h3 style={{ marginTop: 0 }}>Wallet & Transactions</h3>
      <p style={{ color: '#a8adc4', fontSize: 13 }}>
        Monad Testnet only. This sends native MON, not compute-yield revenue or a contract distribution.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => void connectWallet()}
          disabled={connecting || busy}
          style={{ padding: '10px 14px', borderRadius: 9, border: 0, background: '#9c8cff', color: '#171327', fontWeight: 700, cursor: connecting || busy ? 'wait' : 'pointer', opacity: connecting || busy ? 0.7 : 1 }}
        >
          {connecting ? 'Connecting…' : account ? 'Wallet Connected' : 'Connect Wallet'}
        </button>
        {account && <span style={{ color: '#9de5b2', fontSize: 13, overflowWrap: 'anywhere' }}>{account}</span>}
      </div>

      <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }} htmlFor="tx-recipient">Recipient address</label>
      <input
        id="tx-recipient"
        value={recipient}
        onChange={event => setRecipient(event.target.value.trim())}
        placeholder="0x..."
        autoComplete="off"
        spellCheck={false}
        style={{ boxSizing: 'border-box', width: '100%', padding: 11, marginBottom: 12, borderRadius: 8, border: '1px solid #454b63', background: '#10121b', color: '#fff' }}
      />

      <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }} htmlFor="tx-amount">Amount (MON)</label>
      <input
        id="tx-amount"
        value={amount}
        onChange={event => setAmount(event.target.value)}
        inputMode="decimal"
        style={{ boxSizing: 'border-box', width: '100%', padding: 11, marginBottom: 12, borderRadius: 8, border: '1px solid #454b63', background: '#10121b', color: '#fff' }}
      />

      <button
        type="button"
        disabled={busy || !account}
        onClick={() => void sendTestTransaction()}
        style={{ padding: '10px 14px', borderRadius: 9, border: 0, background: '#9c8cff', color: '#171327', fontWeight: 700, cursor: busy || !account ? 'not-allowed' : 'pointer', opacity: busy || !account ? 0.7 : 1 }}
      >
        {busy ? 'Processing…' : 'Review & Send Testnet MON'}
      </button>

      {message && <p role="status" style={{ color: '#9de5b2', overflowWrap: 'anywhere' }}>{message}</p>}
      {txHash && <p style={{ overflowWrap: 'anywhere' }}>
        <a href={`${explorer}${txHash}`} target="_blank" rel="noreferrer" style={{ color: '#b8aaff' }}>View transaction on Monad Explorer ↗</a>
      </p>}
      {error && <p role="alert" style={{ color: '#ff9caa', overflowWrap: 'anywhere' }}>{error}</p>}
    </section>
  )
}


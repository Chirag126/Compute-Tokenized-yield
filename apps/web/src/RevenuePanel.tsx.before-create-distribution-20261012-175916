import { useCallback, useEffect, useState } from 'react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  formatUnits,
  getAddress,
  http,
  isAddress,
  type Address,
  type Hash,
} from 'viem'

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:4000'
).replace(/\/+$/, '')

const DISTRIBUTOR_FALLBACK =
  '0xdd13be785fa113e06186038ba246ec3fe1bdc27e' as Address

const monad = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: {
      name: 'Monad Explorer',
      url: 'https://testnet.monadexplorer.com',
    },
  },
})

const publicClient = createPublicClient({
  chain: monad,
  transport: http('https://testnet-rpc.monad.xyz'),
})

const distributorAbi = [
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'distributionId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimedAmount',
    stateMutability: 'view',
    inputs: [
      { name: 'distributionId', type: 'uint256' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

const tokenAbi = [
  {
    type: 'function',
    name: 'getPastVotes',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'timepoint', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const

type Distribution = {
  id?: number | string
  distributionId?: number | string
  token?: string
  revenueToken?: string
  snapshotBlock?: number | string
  totalSupply?: string
  amount?: string
  amountPerToken?: string
  claimedAmount?: string
  createdAt?: number | string
  active?: boolean
  claimDeadline?: number | string
  recovered?: boolean
}

type Status = {
  distributorAddress?: string
  distributor?: string
  address?: string
  treasury?: string
  paused?: boolean
  nextDistributionId?: number | string
  distributionCount?: number | string
  claimPeriodSeconds?: number | string
  recoveryDelaySeconds?: number | string
}

type Eligibility = {
  eligible: boolean
  votes: bigint
  claimed: bigint
  decimals: number
  reason: string
}

function shortAddress(value?: string) {
  if (!value) return 'Not available'
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

function formatDate(value?: number | string) {
  if (value === undefined || value === null || value === '') return '—'
  const numeric = Number(value)
  const date = new Date(numeric < 1e12 ? numeric * 1000 : numeric)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function asBigInt(value?: string | number) {
  try {
    return BigInt(value ?? 0)
  } catch {
    return 0n
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}


export default function RevenuePanel() {
  const [status, setStatus] = useState<Status | null>(null)
  const [distributions, setDistributions] = useState<Distribution[]>([])
  const [account, setAccount] = useState<Address | null>(null)
  const [eligibility, setEligibility] = useState<Record<string, Eligibility>>({})
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const distributorCandidate =
    status?.distributorAddress || status?.distributor || status?.address ||
    DISTRIBUTOR_FALLBACK

  const distributor = isAddress(distributorCandidate)
    ? getAddress(distributorCandidate)
    : DISTRIBUTOR_FALLBACK

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE}/api/v1/revenue/status`)
      if (!response.ok) {
        throw new Error(`Revenue API returned HTTP ${response.status}`)
      }

      const nextStatus = (await response.json()) as Status
      setStatus(nextStatus)

      const count = Math.max(
        0,
        Math.min(25, Number(nextStatus.distributionCount ?? 0)),
      )

      const nextDistributions: Distribution[] = []

      for (let id = count; id >= 1; id--) {
        try {
          const itemResponse = await fetch(
            `${API_BASE}/api/v1/revenue/distributions/${id}`,
          )

          if (!itemResponse.ok) continue

          const payload = await itemResponse.json()
          const item = (payload.distribution ?? payload) as Distribution

          nextDistributions.push({ ...item, id: item.id ?? id })
        } catch {
          // Continue loading other distribution records.
        }
      }

      setDistributions(nextDistributions)
    } catch (cause) {
      setError(
        `${errorMessage(cause)} Check that the API is running and VITE_API_BASE_URL points to it.`,
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const connectWallet = async () => {
    setError('')
    setNotice('')

    try {
      if (!window.ethereum) {
        throw new Error('Install MetaMask to connect your wallet.')
      }

      const chainId = await window.ethereum.request({
        method: 'eth_chainId',
      })

      if (chainId !== '0x279f') {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x279f' }],
          })
        } catch (switchError) {
          const code = (switchError as { code?: number }).code
          if (code !== 4902) throw switchError

          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x279f',
              chainName: 'Monad Testnet',
              nativeCurrency: {
                name: 'MON',
                symbol: 'MON',
                decimals: 18,
              },
              rpcUrls: ['https://testnet-rpc.monad.xyz'],
              blockExplorerUrls: ['https://testnet.monadexplorer.com'],
            }],
          })
        }
      }

      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      }) as string[]

      if (!accounts[0] || !isAddress(accounts[0])) {
        throw new Error('MetaMask did not return a valid account.')
      }

      setAccount(getAddress(accounts[0]))
      setNotice('Wallet connected to Monad Testnet.')
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  const checkEligibility = useCallback(async () => {
    if (!account) {
      setEligibility({})
      return
    }

    setChecking(true)
    setError('')

    try {
      const isPaused = await publicClient.readContract({
        address: distributor,
        abi: distributorAbi,
        functionName: 'paused',
      })

      const results: Record<string, Eligibility> = {}

      for (const item of distributions) {
        const id = String(item.id ?? item.distributionId ?? '')
        const tokenAddress = item.token

        if (!id || !tokenAddress || !isAddress(tokenAddress)) continue

        try {
          const snapshotBlock = asBigInt(item.snapshotBlock)
          const deadline = Number(item.claimDeadline ?? 0)
          const nowSeconds = Math.floor(Date.now() / 1000)

          const [votes, claimed, decimals] = await Promise.all([
            publicClient.readContract({
              address: getAddress(tokenAddress),
              abi: tokenAbi,
              functionName: 'getPastVotes',
              args: [account, snapshotBlock],
            }),
            publicClient.readContract({
              address: distributor,
              abi: distributorAbi,
              functionName: 'claimedAmount',
              args: [BigInt(id), account],
            }),
            item.revenueToken && isAddress(item.revenueToken)
              ? publicClient.readContract({
                  address: getAddress(item.revenueToken),
                  abi: tokenAbi,
                  functionName: 'decimals',
                }).catch(() => 18)
              : Promise.resolve(18),
          ])

          const active = item.active !== false
          const recovered = item.recovered === true
          const expired = deadline > 0 && nowSeconds > deadline
          const remaining = asBigInt(item.amount) - asBigInt(item.claimedAmount)

          let reason = 'Eligible to attempt claim'
          if (isPaused) reason = 'Distributor is paused'
          else if (!active) reason = 'Distribution is inactive'
          else if (recovered) reason = 'Distribution funds were recovered'
          else if (expired) reason = 'Claim deadline has passed'
          else if (claimed > 0n) reason = 'Already claimed'
          else if (votes === 0n) reason = 'No voting power at snapshot block'
          else if (remaining <= 0n) reason = 'No remaining distribution funds'

          results[id] = {
            eligible:
              !isPaused && active && !recovered && !expired &&
              claimed === 0n && votes > 0n && remaining > 0n,
            votes,
            claimed,
            decimals: Number(decimals),
            reason,
          }
        } catch (cause) {
          results[id] = {
            eligible: false,
            votes: 0n,
            claimed: 0n,
            decimals: 18,
            reason: `Could not verify on-chain: ${errorMessage(cause)}`,
          }
        }
      }

      setEligibility(results)
    } catch (cause) {
      setError(`Eligibility check failed: ${errorMessage(cause)}`)
    } finally {
      setChecking(false)
    }
  }, [account, distributor, distributions])

  useEffect(() => {
    void checkEligibility()
  }, [checkEligibility])

  const claim = async (id: string) => {
    if (!account || !window.ethereum) {
      setError('Connect MetaMask before claiming.')
      return
    }

    setClaimingId(id)
    setError('')
    setNotice('')

    try {
      const walletClient = createWalletClient({
        account,
        chain: monad,
        transport: custom(window.ethereum as never),
      })

      const hash: Hash = await walletClient.writeContract({
        address: distributor,
        abi: distributorAbi,
        functionName: 'claim',
        args: [BigInt(id)],
        account,
        chain: monad,
      })

      setNotice(`Claim transaction submitted: ${hash}`)

      const receipt = await publicClient.waitForTransactionReceipt({ hash })

      if (receipt.status !== 'success') {
        throw new Error('Claim transaction reverted.')
      }

      setNotice(`Claim confirmed: ${hash}`)
      await load()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setClaimingId(null)
    }
  }

  return (
    <section className="revenue-workspace" id="revenue-workspace">
      <div className="section-heading">
        <div>
          <div className="eyebrow">ON-CHAIN DISTRIBUTIONS</div>
          <h2>Revenue sharing</h2>
          <p>
            Review distributions and check claim eligibility using your
            historical voting power.
          </p>
        </div>

        <div className="panel-actions">
          <button type="button" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          {!account ? (
            <button type="button" onClick={() => void connectWallet()}>
              Connect wallet
            </button>
          ) : (
            <button type="button" onClick={() => void checkEligibility()} disabled={checking}>
              {checking ? 'Checking…' : 'Check eligibility'}
            </button>
          )}
        </div>
      </div>

      {notice && <p role="status" className="success-message">{notice}</p>}
      {error && <p role="alert" className="error-message">{error}</p>}

      <div className="content-grid">
        <div className="metric-card">
          <span>Distributor</span>
          <strong title={distributor}>{shortAddress(distributor)}</strong>
        </div>
        <div className="metric-card">
          <span>Distributions found</span>
          <strong>{status?.distributionCount ?? '—'}</strong>
        </div>
        <div className="metric-card">
          <span>Contract status</span>
          <strong>{status?.paused ? 'Paused' : status ? 'Active' : 'Unknown'}</strong>
        </div>
      </div>

      <div className="panel-card">
        <h3>Distribution history</h3>

        {loading ? (
          <p>Loading distribution history…</p>
        ) : distributions.length === 0 ? (
          <p>
            No distributions were found. A revenue manager must create an
            on-chain distribution before users can claim.
          </p>
        ) : (
          <div className="distribution-list">
            {distributions.map((item) => {
              const id = String(item.id ?? item.distributionId ?? '')
              const check = eligibility[id]
              const decimals = check?.decimals ?? 18
              const amount = item.amount
                ? formatUnits(asBigInt(item.amount), decimals)
                : '—'

              return (
                <article className="distribution-card" key={id}>
                  <div className="distribution-header">
                    <div>
                      <span className="eyebrow">DISTRIBUTION #{id}</span>
                      <h4>{amount} revenue tokens</h4>
                    </div>
                    <span className="status-pill">
                      {item.recovered ? 'Recovered' : item.active === false ? 'Inactive' : 'Recorded'}
                    </span>
                  </div>

                  <dl className="distribution-details">
                    <div>
                      <dt>Asset token</dt>
                      <dd title={item.token}>{shortAddress(item.token)}</dd>
                    </div>
                    <div>
                      <dt>Revenue token</dt>
                      <dd title={item.revenueToken}>{shortAddress(item.revenueToken)}</dd>
                    </div>
                    <div>
                      <dt>Snapshot block</dt>
                      <dd>{item.snapshotBlock ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>{formatDate(item.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Claim deadline</dt>
                      <dd>{formatDate(item.claimDeadline)}</dd>
                    </div>
                    <div>
                      <dt>Your voting power</dt>
                      <dd>
                        {check ? formatUnits(check.votes, 18) : account ? 'Checking…' : 'Connect wallet'}
                      </dd>
                    </div>
                  </dl>

                  {account && (
                    <p className={check?.eligible ? 'success-message' : 'eligibility-message'}>
                      {check?.reason ?? 'Eligibility has not been checked.'}
                    </p>
                  )}

                  <button
                    type="button"
                    disabled={!account || !check?.eligible || claimingId === id}
                    onClick={() => void claim(id)}
                  >
                    {claimingId === id ? 'Claiming…' : 'Claim revenue'}
                  </button>
                </article>
              )
            })}
          </div>
        )}
      </div>

      <p className="muted-note">
        Claims are executed on Monad Testnet. Eligibility depends on the
        distribution snapshot, historical voting power, contract status,
        claim deadline, and remaining funds. This panel does not create
        distributions or deposit revenue.
      </p>
    </section>
  )
}


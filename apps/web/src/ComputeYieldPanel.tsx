
import { useEffect, useMemo, useState } from 'react'
import { createWalletClient, custom, defineChain, type Address, type Hash } from 'viem'
import './ComputeYieldPanel.css'

const REGISTRY_ADDRESS = "0x44b4bd70829d23d82bbda1dff13ebb09e2c557fb" as Address
const MONAD_CHAIN_ID = 10143
const EXPLORER_URL = "https://testnet.monadexplorer.com"

const monadTestnet = defineChain({
  id: MONAD_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "Monad Explorer", url: EXPLORER_URL },
  },
})

const computeIntentAbi = [
  {
    type: "function",
    name: "registerIntent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "provider", type: "string" },
      { name: "offerId", type: "string" },
    ],
    outputs: [],
  },
] as const
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'
).replace(/\/+$/, '')

type Offer = {
  id?: string | number
  externalAssetId?: string | number
  name?: string | null
  gpuName?: string | null
  gpuCount?: number | null
  numGpus?: number | null
  hourlyPriceUsd?: number | null
  reliability?: number | null
}

const usd = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)

export default function ComputeYieldPanel() {
  const [offers, setOffers] = useState<Offer[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [walletAddress, setWalletAddress] = useState<Address | "">("")
  const [registering, setRegistering] = useState(false)
  const [intentStatus, setIntentStatus] = useState("")
  const [intentError, setIntentError] = useState("")
  const [intentHash, setIntentHash] = useState<Hash | "">("")

  const [hours, setHours] = useState(12)
  const [utilization, setUtilization] = useState(70)
  const [revenueRate, setRevenueRate] = useState(2.25)
  const [otherCosts, setOtherCosts] = useState(3)
  const [days, setDays] = useState(30)

  async function registerComputeIntent() {
    setIntentError("")
    setIntentStatus("")
    setIntentHash("")

    if (!window.ethereum) {
      setIntentError("MetaMask was not detected. Install or unlock MetaMask and try again.")
      return
    }

    if (!selected) {
      setIntentError("Select a GPU offer first.")
      return
    }

    const rawOfferId = selected.id ?? selected.externalAssetId
    if (rawOfferId === undefined || rawOfferId === null || String(rawOfferId).trim() === "") {
      setIntentError("This offer has no provider offer ID, so it cannot be registered.")
      return
    }

    setRegistering(true)
    try {
      setIntentStatus("Connecting wallet…")

      const chainIdRaw = await window.ethereum.request({ method: "eth_chainId" })
      const currentChainId = typeof chainIdRaw === "string"
        ? Number.parseInt(chainIdRaw, 16)
        : Number(chainIdRaw)

      if (currentChainId !== MONAD_CHAIN_ID) {
        setIntentStatus("Requesting Monad Testnet…")
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x279f" }],
        })
      }

      const accountsRaw = await window.ethereum.request({ method: "eth_requestAccounts" })
      const accounts = accountsRaw as string[]
      if (!Array.isArray(accounts) || !accounts[0]) {
        throw new Error("No wallet account was returned by MetaMask.")
      }

      const account = accounts[0] as Address
      setWalletAddress(account)

      const walletClient = createWalletClient({
        account,
        chain: monadTestnet,
        transport: custom(window.ethereum as never),
      })

      setIntentStatus("Confirm the transaction in MetaMask…")
      const hash = await walletClient.writeContract({
        account,
        chain: monadTestnet,
        address: REGISTRY_ADDRESS,
        abi: computeIntentAbi,
        functionName: "registerIntent",
        args: ["vast", String(rawOfferId)],
      })

      setIntentHash(hash)
      setIntentStatus("Transaction submitted. Waiting for confirmation…")

      const response = await fetch(
        `https://testnet-rpc.monad.xyz`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getTransactionReceipt",
            params: [hash],
          }),
        },
      )

      if (!response.ok) {
        setIntentStatus("Submitted; check the Explorer for confirmation.")
        return
      }

      const receiptData = await response.json() as {
        result?: { status?: string } | null
      }

      // A null receipt means the transaction may still be pending.
      if (!receiptData.result) {
        setIntentStatus("Submitted; the transaction may still be pending. Check the Explorer.")
      } else if (receiptData.result.status === "0x1") {
        setIntentStatus("Confirmed on Monad Testnet. Compute intent recorded.")
      } else {
        setIntentStatus("The transaction reverted. Check the Explorer for details.")
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unknown wallet error"
      setIntentError(
        message.includes("4001") || message.toLowerCase().includes("user rejected")
          ? "Transaction rejected in MetaMask."
          : message,
      )
      setIntentStatus("")
    } finally {
      setRegistering(false)
    }
  }
  useEffect(() => {
    const controller = new AbortController()

    async function loadOffers() {
      setLoading(true)
      setError('')

      try {
        const response = await fetch(
          `${API_BASE}/api/v1/providers/vast/offers?limit=50`,
          {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          },
        )

        if (!response.ok) {
          throw new Error(`Provider API returned ${response.status}`)
        }

        const data = (await response.json()) as {
          offers?: Offer[]
        }

        const nextOffers = Array.isArray(data.offers)
          ? data.offers
          : []

        setOffers(nextOffers)

        setSelectedId((current) => {
          if (
            current &&
            nextOffers.some(
              (offer, index) =>
                String(offer.id ?? offer.externalAssetId ?? index) ===
                current,
            )
          ) {
            return current
          }

          const index = nextOffers.findIndex(
            (offer) =>
              typeof offer.hourlyPriceUsd === 'number' &&
              Number.isFinite(offer.hourlyPriceUsd) &&
              offer.hourlyPriceUsd >= 0,
          )

          const first = index >= 0 ? index : 0
          const offer = nextOffers[first]

          return offer
            ? String(offer.id ?? offer.externalAssetId ?? first)
            : ''
        })
      } catch (cause) {
        if (cause instanceof Error && cause.name === 'AbortError') return

        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load GPU offers',
        )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void loadOffers()
    return () => controller.abort()
  }, [refresh])

  const selected = useMemo(() => {
    const index = offers.findIndex(
      (offer, i) =>
        String(offer.id ?? offer.externalAssetId ?? i) === selectedId,
    )

    return index >= 0 ? offers[index] : undefined
  }, [offers, selectedId])

  const price =
    typeof selected?.hourlyPriceUsd === 'number' &&
    Number.isFinite(selected.hourlyPriceUsd) &&
    selected.hourlyPriceUsd >= 0
      ? selected.hourlyPriceUsd
      : null

  const gpuCount = Math.max(
    1,
    Number(selected?.gpuCount ?? selected?.numGpus ?? 1) || 1,
  )

  const safeHours = Math.min(24, Math.max(0, Number(hours) || 0))
  const safeUtilization = Math.min(
    100,
    Math.max(0, Number(utilization) || 0),
  )
  const safeRevenue = Math.max(0, Number(revenueRate) || 0)
  const safeOtherCosts = Math.max(0, Number(otherCosts) || 0)
  const safeDays = Math.min(365, Math.max(1, Number(days) || 1))

  const billableHours = safeHours * safeUtilization / 100
  const grossDaily = billableHours * safeRevenue * gpuCount
  const rentalDaily = price === null ? null : safeHours * price * gpuCount
  const netDaily =
    rentalDaily === null
      ? null
      : grossDaily - rentalDaily - safeOtherCosts

  const grossTotal = grossDaily * safeDays
  const rentalTotal =
    rentalDaily === null ? null : rentalDaily * safeDays
  const otherTotal = safeOtherCosts * safeDays
  const netTotal =
    netDaily === null ? null : netDaily * safeDays

  const roi =
    rentalTotal !== null &&
    rentalTotal + otherTotal > 0 &&
    netTotal !== null
      ? netTotal / (rentalTotal + otherTotal) * 100
      : null

  return (
    <section className="compute-yield">
      <header className="yield-header">
        <div>
          <div className="section-kicker">
            COMPUTE ECONOMICS / SIMULATOR
          </div>
          <h1>Compute <span>Yield</span></h1>
          <p className="welcome-copy">
            Estimate GPU operating economics using provider offers and
            your own revenue and cost assumptions.
          </p>
        </div>

        <button
          className="refresh-button"
          type="button"
          disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}
        >
          {loading ? 'Loading offers…' : '↻ Refresh offers'}
        </button>
      </header>

      {error && (
        <div className="yield-error" role="alert">
          <strong>Could not load provider offers</strong>
          <p>{error}</p>
          <button
            className="text-button"
            type="button"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      )}

      <div className="yield-grid">
        <section className="panel yield-card">
          <div className="panel-heading">
            <div>
              <div className="section-kicker">01 / CONFIGURATION</div>
              <h2>Choose your compute</h2>
            </div>
          </div>

          <div className="yield-form">
            <label>
              GPU provider offer
              <select
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                disabled={loading || offers.length === 0}
              >
                {offers.length === 0 && (
                  <option value="">
                    {loading ? 'Loading…' : 'No offers available'}
                  </option>
                )}

                {offers.map((offer, index) => {
                  const id = String(
                    offer.id ?? offer.externalAssetId ?? index,
                  )
                  const model =
                    offer.gpuName ?? offer.name ?? 'Unknown GPU'
                  const offerPrice =
                    typeof offer.hourlyPriceUsd === 'number'
                      ? `${usd(offer.hourlyPriceUsd)}/hr`
                      : 'Price unavailable'

                  return (
                    <option key={id} value={id}>
                      {model} · {offerPrice} · #{id}
                    </option>
                  )
                })}
              </select>
            </label>

            {selected && (
              <div className="yield-selected">
                <div>
                  <span>Selected GPU</span>
                  <strong>
                    {selected.gpuName ?? selected.name ?? 'Unknown GPU'}
                  </strong>
                  <small>
                    Offer ID: {String(selected.id ?? selected.externalAssetId ?? 'N/A')}
                  </small>
                </div>
                <div>
                  <span>Provider price</span>
                  <strong>{price === null ? 'Unavailable' : usd(price)}</strong>
                  <small>Per hour, per offer</small>
                </div>
              </div>
            )}

            <div className="intent-card">
              <div className="intent-card-header">
                <div>
                  <div className="section-kicker">ON-CHAIN / COMPUTE INTENT</div>
                  <h3>Register this GPU offer</h3>
                </div>
                <span className="intent-network-badge">MONAD TESTNET</span>
              </div>

              <p className="intent-description">
                Record the selected VAST offer ID on-chain. This test transaction
                does not rent a GPU or pay the advertised rental price.
              </p>

              <button
                className="intent-button"
                type="button"
                disabled={registering || loading || !selected}
                onClick={() => void registerComputeIntent()}
              >
                {registering ? "Processing transaction…" : "Register Compute Intent"}
              </button>

              {(intentStatus || intentHash || intentError) && (
                <div className={`intent-result ${intentError ? "has-error" : "has-status"}`}>
                  <div className="intent-result-heading">
                    <span className="intent-result-icon">
                      {intentError ? "!" : intentStatus.startsWith("Confirmed") ? "✓" : "↗"}
                    </span>
                    <div>
                      <strong>
                        {intentError
                          ? "Transaction issue"
                          : intentStatus.startsWith("Confirmed")
                            ? "Transaction confirmed"
                            : "Transaction update"}
                      </strong>
                      <p>{intentError || intentStatus}</p>
                    </div>
                  </div>

                  {walletAddress && (
                    <div className="intent-detail">
                      <span>Connected wallet</span>
                      <code>{walletAddress}</code>
                    </div>
                  )}

                  {intentHash && (
                    <div className="intent-detail">
                      <span>Transaction hash</span>
                      <code>{intentHash}</code>
                      <a
                        className="intent-explorer-link"
                        href={`${EXPLORER_URL}/tx/${intentHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View transaction on Explorer ↗
                      </a>
                    </div>
                  )}

                  <div className="intent-detail">
                    <span>Registry contract</span>
                    <code>{REGISTRY_ADDRESS}</code>
                    <a
                      className="intent-explorer-link"
                      href={`${EXPLORER_URL}/address/${REGISTRY_ADDRESS}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View contract on Explorer ↗
                    </a>
                  </div>
                </div>
              )}

              <div className="intent-footer">
                <span className="intent-footer-dot" />
                <span>Monad Testnet · Chain ID 10143 · No rental payment</span>
              </div>
            </div>
{price === null && selected && (
              <p className="yield-field-note">
                This offer has no valid price. Select another offer to
                calculate rental costs.
              </p>
            )}

            <div className="yield-input-grid">
              <label>
                Operating hours / day
                <input
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  value={hours}
                  onChange={(event) => setHours(Number(event.target.value))}
                />
              </label>

              <label>
                Utilization (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={utilization}
                  onChange={(event) =>
                    setUtilization(Number(event.target.value))
                  }
                />
              </label>

              <label>
                Assumed revenue / GPU-hour ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={revenueRate}
                  onChange={(event) =>
                    setRevenueRate(Number(event.target.value))
                  }
                />
              </label>

              <label>
                Other operating costs / day ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={otherCosts}
                  onChange={(event) =>
                    setOtherCosts(Number(event.target.value))
                  }
                />
              </label>

              <label>
                Projection period (days)
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={days}
                  onChange={(event) => setDays(Number(event.target.value))}
                />
              </label>
            </div>
          </div>
        </section>

        <section className="panel yield-card">
          <div className="panel-heading">
            <div>
              <div className="section-kicker">02 / PROJECTION</div>
              <h2>Estimated outcome</h2>
            </div>
            <span className="environment-tag">USD</span>
          </div>

          <div className="yield-results">
            <div className="yield-total">
              <span>Net modeled result · {safeDays} days</span>
              <strong className={netTotal !== null && netTotal < 0 ? 'negative' : ''}>
                {netTotal === null ? '—' : usd(netTotal)}
              </strong>
              <small>
                {netTotal === null
                  ? 'A valid provider price is required'
                  : netTotal < 0
                    ? 'Loss under these assumptions'
                    : 'Positive modeled margin'}
              </small>
            </div>

            <div className="yield-row">
              <span>Gross modeled revenue</span>
              <strong>{usd(grossTotal)}</strong>
            </div>
            <div className="yield-row">
              <span>GPU rental costs</span>
              <strong>{rentalTotal === null ? '—' : usd(rentalTotal)}</strong>
            </div>
            <div className="yield-row">
              <span>Other operating costs</span>
              <strong>{usd(otherTotal)}</strong>
            </div>
            <div className="yield-row">
              <span>Net modeled result</span>
              <strong>{netTotal === null ? '—' : usd(netTotal)}</strong>
            </div>
            <div className="yield-row">
              <span>Estimated ROI on modeled costs</span>
              <strong>{roi === null ? '—' : `${roi.toFixed(2)}%`}</strong>
            </div>

            <div className="yield-daily">
              <div>
                <span>Gross / day</span>
                <strong>{usd(grossDaily)}</strong>
              </div>
              <div>
                <span>Net / day</span>
                <strong>{netDaily === null ? '—' : usd(netDaily)}</strong>
              </div>
              <div>
                <span>Billable GPU-hours / day</span>
                <strong>
                  {(billableHours * gpuCount).toFixed(2)}
                </strong>
              </div>
            </div>

            <p className="yield-field-note">
              Gross revenue = operating hours × utilization × assumed
              revenue rate × GPU count. Net result subtracts provider
              rental and other modeled costs.
            </p>
          </div>
        </section>
      </div>

      <div className="security-note yield-bottom-note">
        <span>ⓘ</span>
        <p>
          This calculator models possible economics, not actual earnings. Registering a compute intent writes the selected offer ID on Monad Testnet; it does not rent a GPU or make a rental payment.
        </p>
      </div>
    </section>
  )
}

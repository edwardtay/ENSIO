'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useSendTransaction, useSwitchChain } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useGasTank } from '@/hooks/use-gas-tank'
import { useClientEnsPreferences } from '@/hooks/use-client-ens'
import { InvoiceModal } from '@/components/invoice-modal'

// AI Agent simulation result type
type AgentSimulation = {
  success: boolean
  simulation: {
    scenario: string
    steps: Array<{
      step: number
      action: string
      provider: string
      status: string
    }>
    integrations: {
      lifi: { used: boolean; realQuote: boolean; purpose: string }
      uniswapV4: { used: boolean; hook: string; poolId: string; purpose: string }
    }
  }
}

function useAgentStatus() {
  const [simulation, setSimulation] = useState<AgentSimulation | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastRun, setLastRun] = useState<Date | null>(null)

  const runSimulation = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/agent/cron?action=simulate')
      const data = await res.json()
      setSimulation(data)
      setLastRun(new Date())
    } catch {
      setSimulation(null)
    } finally {
      setLoading(false)
    }
  }, [])

  return { simulation, loading, lastRun, runSimulation }
}

// Vault options
const VAULT_OPTIONS = [
  { id: 'aave-usdc', address: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', name: 'Aave', protocol: 'Aave v3' },
  { id: 'spark-usdc', address: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A', name: 'Spark', protocol: 'Morpho · Spark' },
  { id: 'moonwell-usdc', address: '0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca', name: 'Moonwell', protocol: 'Moonwell' },
] as const

type Receipt = {
  txHash: string
  amount: string
  token: string
  chain: string
  from: string
  createdAt: string
}

type VaultPosition = {
  shares: string
  assets: string
  apy: string
  earned: string
}

function useEnsName(address?: string) {
  const [name, setName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!address) { setName(null); return }
    setLoading(true)
    fetch(`/api/ens/primary-name?address=${address}&chainId=1`)
      .then((r) => r.json())
      .then((data) => setName(data.name ?? null))
      .catch(() => setName(null))
      .finally(() => setLoading(false))
  }, [address])

  return { name, loading }
}

// Replaced server-side useEnsPreferences with client-side useClientEnsPreferences from hooks/use-client-ens.ts

function useReceipts(address?: string) {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!address) { setReceipts([]); return }
    setLoading(true)
    fetch(`/api/ens/receipts?recipient=${address}`)
      .then((r) => r.json())
      .then((data) => setReceipts(data.receipts ?? []))
      .catch(() => setReceipts([]))
      .finally(() => setLoading(false))
  }, [address])

  return { receipts, loading }
}

function useVaultPosition(vaultAddress?: string, userAddress?: string) {
  const [position, setPosition] = useState<VaultPosition | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!vaultAddress || !userAddress) { setPosition(null); return }
    setLoading(true)
    fetch(`/api/vault/position?user=${userAddress}&vault=${vaultAddress}`)
      .then((r) => r.json())
      .then((data) => { if (!data.error) setPosition(data); else setPosition(null) })
      .catch(() => setPosition(null))
      .finally(() => setLoading(false))
  }, [vaultAddress, userAddress])

  return { position, loading }
}

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ReceiverDashboard() {
  const { address, isConnected, chainId } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const { switchChainAsync } = useSwitchChain()
  const { name: ensName, loading: ensLoading } = useEnsName(address)
  const { vault: currentVault, strategy: currentStrategy, avatar: ensAvatar, loading: prefsLoading } = useClientEnsPreferences(ensName)
  const { receipts, loading: receiptsLoading } = useReceipts(address)
  const { position: vaultPosition, loading: positionLoading } = useVaultPosition(currentVault ?? undefined, address)
  const gasTank = useGasTank()
  const agent = useAgentStatus()

  const [showSettings, setShowSettings] = useState(false)
  const [depositAmount, setDepositAmount] = useState('0.005')
  const [selectedVaultId, setSelectedVaultId] = useState<string>('')
  const [selectedStrategy, setSelectedStrategy] = useState<string>('yield')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveTxHash, setSaveTxHash] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)

  // Sync with current preferences
  useEffect(() => {
    if (currentVault && !selectedVaultId) {
      const found = VAULT_OPTIONS.find(v => v.address.toLowerCase() === currentVault.toLowerCase())
      if (found) setSelectedVaultId(found.id)
    }
  }, [currentVault, selectedVaultId])

  useEffect(() => {
    if (currentStrategy) setSelectedStrategy(currentStrategy)
  }, [currentStrategy])

  const selectedVault = VAULT_OPTIONS.find(v => v.id === selectedVaultId)
  const vaultAddress = selectedVault?.address || ''
  const vaultChanged = currentVault ? vaultAddress.toLowerCase() !== currentVault.toLowerCase() : vaultAddress !== ''
  const strategyChanged = currentStrategy ? selectedStrategy !== currentStrategy : selectedStrategy !== 'yield'

  const handleSave = async () => {
    if (!ensName) return
    setSaving(true)
    setSaveSuccess(false)
    setSaveTxHash(null)
    setSaveError(null)

    try {
      if (chainId !== 1) await switchChainAsync({ chainId: 1 })

      const body: { ensName: string; strategy: string; vaultAddress?: string } = { ensName, strategy: selectedStrategy }
      if (selectedStrategy === 'yield' && vaultAddress) body.vaultAddress = vaultAddress

      const res = await fetch('/api/ens/set-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed')
      const txData = await res.json()

      const hash = await sendTransactionAsync({
        to: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        value: BigInt(txData.value || 0),
      })

      setSaveTxHash(hash)
      setSaveSuccess(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed'
      setSaveError(/rejected|denied/i.test(msg) ? 'Rejected' : msg)
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(`${window.location.origin}/pay/${ensName}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Not connected
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
        <div className="w-20 h-20 mb-6 rounded-2xl bg-gradient-to-br from-[#1C1B18] to-[#3D3C38] flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-[#F8F7F4]">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="text-3xl font-semibold text-[#1C1B18] mb-3">Get Paid in Crypto</h1>
        <p className="text-[#6B6960] mb-8 text-center max-w-md text-lg">
          One link for all clients. Any token, any chain. Earn yield on your balance.
        </p>
        <ConnectButton />
      </div>
    )
  }

  // Loading
  if (ensLoading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="animate-spin w-8 h-8 border-2 border-[#1C1B18] border-t-transparent rounded-full" />
      </div>
    )
  }

  // No ENS
  if (!ensName) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
        <div className="w-20 h-20 mb-6 rounded-2xl bg-[#FFF3E0] flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-[#E65100]">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M12 8V12M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-[#1C1B18] mb-2">ENS Name Required</h1>
        <p className="text-[#6B6960] mb-6 text-center max-w-sm">
          Your ENS name becomes your payment link. Get one to start receiving payments.
        </p>
        <a
          href="https://app.ens.domains"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#1C1B18] text-white font-medium hover:bg-[#2D2C28] transition-colors"
        >
          Get ENS Name
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>
    )
  }

  const paymentLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/pay/${ensName}`
  const strategyLabel = currentStrategy === 'restaking' ? 'Renzo' : currentStrategy === 'liquid' ? 'Liquid' : 'Aave'

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      {/* Payment Link Hero */}
      <Card className="border-[#E4E2DC] bg-white overflow-hidden">
        <div className="bg-gradient-to-br from-[#1C1B18] to-[#2D2C28] p-5">
          <div className="flex items-center gap-3">
            {ensAvatar ? (
              <img src={ensAvatar} alt="" className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-xl font-bold text-white">{ensName?.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div>
              <h1 className="text-xl font-semibold text-white">{ensName}</h1>
              <p className="text-white/60 text-sm font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</p>
            </div>
          </div>
        </div>

        <CardContent className="p-5">
          <div className="flex gap-5">
            {/* QR Code */}
            <div className="p-2 bg-white rounded-lg border border-[#E4E2DC] shrink-0">
              <QRCodeSVG value={paymentLink} size={100} level="M" bgColor="#FFFFFF" fgColor="#1C1B18" />
            </div>

            {/* Link & Actions */}
            <div className="flex-1 space-y-3">
              <div className="p-2.5 bg-[#F8F7F4] rounded-lg">
                <p className="font-mono text-xs text-[#1C1B18] break-all">{paymentLink}</p>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleCopy} variant="outline" className="flex-1 h-9 text-sm border-[#E4E2DC]">
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
                <Button
                  onClick={async () => {
                    if (navigator.share) {
                      try { await navigator.share({ title: `Pay ${ensName}`, url: paymentLink }) } catch {}
                    } else handleCopy()
                  }}
                  className="flex-1 h-9 text-sm bg-[#1C1B18] hover:bg-[#2D2C28] text-white"
                >
                  Share
                </Button>
              </div>
              <Button
                onClick={() => setShowInvoiceModal(true)}
                variant="outline"
                className="w-full h-9 text-sm border-[#E4E2DC] mt-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="mr-1.5">
                  <path d="M9 14L11 16L15 12M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Request Payment
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Balance Card */}
      <Card className="border-[#E4E2DC] bg-white">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#6B6960]">Balance</p>
              {positionLoading || prefsLoading ? (
                <div className="h-8 w-24 bg-[#F8F7F4] rounded animate-pulse mt-1" />
              ) : (
                <p className="text-2xl font-semibold text-[#1C1B18]">
                  ${vaultPosition?.assets ?? '0.00'}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-[#6B6960]">Yield earned</p>
              {positionLoading || prefsLoading ? (
                <div className="h-8 w-16 bg-[#F8F7F4] rounded animate-pulse mt-1" />
              ) : (
                <p className="text-2xl font-semibold text-[#22C55E]">
                  +${vaultPosition?.earned ?? '0.00'}
                </p>
              )}
            </div>
          </div>
          {(currentVault || currentStrategy) && (
            <p className="text-xs text-[#6B6960] mt-3 pt-3 border-t border-[#E4E2DC]">
              Earning via {strategyLabel} · {vaultPosition?.apy ?? '~4'}% APY
            </p>
          )}
        </CardContent>
      </Card>

      {/* Gas Tank Card */}
      <Card className="border-[#E4E2DC] bg-white">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                gasTank.status?.estimatedPayments && gasTank.status.estimatedPayments > 20
                  ? 'bg-[#EDF5F0]'
                  : 'bg-[#FFF3E0]'
              }`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={
                  gasTank.status?.estimatedPayments && gasTank.status.estimatedPayments > 20
                    ? 'text-[#22C55E]'
                    : 'text-[#E65100]'
                }>
                  <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className="font-medium text-[#1C1B18]">Gas Tank</p>
                <p className="text-sm text-[#6B6960]">
                  {gasTank.loading ? (
                    <span className="inline-block h-4 w-20 bg-[#E4E2DC] rounded animate-pulse" />
                  ) : gasTank.status?.estimatedPayments ? (
                    <>~{gasTank.status.estimatedPayments} gasless payments</>
                  ) : (
                    <>Not activated</>
                  )}
                </p>
              </div>
            </div>
            <div className="text-right">
              {gasTank.loading ? (
                <div className="h-6 w-16 bg-[#F8F7F4] rounded animate-pulse" />
              ) : (
                <p className="font-semibold text-[#1C1B18]">
                  {gasTank.status?.balance ? `${parseFloat(gasTank.status.balance).toFixed(4)} ETH` : '0 ETH'}
                </p>
              )}
            </div>
          </div>
          {gasTank.status?.estimatedPayments !== undefined && gasTank.status.estimatedPayments > 0 && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#E4E2DC]">
              <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
              <p className="text-xs text-[#22C55E]">AI agent monitoring • Auto-refills when low</p>
            </div>
          )}
          {gasTank.status?.estimatedPayments !== undefined && gasTank.status.estimatedPayments < 20 && gasTank.status.estimatedPayments > 0 && (
            <p className="text-xs text-[#E65100] mt-2">
              Low balance - AI agent will refill from your cheapest chain
            </p>
          )}
          {!gasTank.status?.canReceive && gasTank.status !== null && (
            <p className="text-xs text-[#E65100] mt-3 pt-3 border-t border-[#E4E2DC]">
              Gas tank empty - add funds to enable gasless payments
            </p>
          )}
        </CardContent>
      </Card>

      {/* AI Agent Status */}
      <Card className="border-[#E4E2DC] bg-white">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#F0F9FF] flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#0EA5E9]">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-4h2v2h-2v-2zm1-10c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z" fill="currentColor"/>
                </svg>
              </div>
              <h2 className="font-semibold text-[#1C1B18]">AI Agent</h2>
            </div>
            {agent.lastRun && (
              <span className="text-xs text-[#6B6960]">
                Last run: {agent.lastRun.toLocaleTimeString()}
              </span>
            )}
          </div>

          {agent.simulation?.success ? (
            <div className="space-y-3">
              {/* Steps */}
              <div className="space-y-2">
                {agent.simulation.simulation.steps.map((step) => (
                  <div key={step.step} className="flex items-center gap-2 text-sm">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${
                      step.status === 'quote_ready' ? 'bg-[#EDF5F0] text-[#22C55E]' :
                      step.status === 'simulated' ? 'bg-[#F0F9FF] text-[#0EA5E9]' :
                      'bg-[#FFF3E0] text-[#E65100]'
                    }`}>
                      {step.status === 'quote_ready' ? '✓' : step.status === 'simulated' ? '~' : '!'}
                    </div>
                    <span className="text-[#1C1B18]">{step.action}</span>
                    <span className="text-[#9C9B93] text-xs">({step.provider})</span>
                  </div>
                ))}
              </div>

              {/* Integrations */}
              <div className="flex gap-2 pt-2 border-t border-[#E4E2DC]">
                {agent.simulation.simulation.integrations.lifi.realQuote && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#EDF5F0] text-[#22C55E] text-xs font-medium">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    LI.FI Quote
                  </span>
                )}
                {agent.simulation.simulation.integrations.uniswapV4.used && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#FDF2F8] text-[#EC4899] text-xs font-medium">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Uniswap v4
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#6B6960]">
              Run a simulation to see how the AI agent handles gas tank refills.
            </p>
          )}

          <Button
            onClick={agent.runSimulation}
            disabled={agent.loading}
            variant="outline"
            className="w-full mt-3 border-[#E4E2DC]"
          >
            {agent.loading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin w-4 h-4 border-2 border-[#1C1B18] border-t-transparent rounded-full" />
                Running...
              </span>
            ) : (
              'Run Simulation'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Recent Payments */}
      <Card className="border-[#E4E2DC] bg-white">
        <CardContent className="p-5">
          <h2 className="font-semibold text-[#1C1B18] mb-3">Recent Payments</h2>
          {receiptsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-12 bg-[#F8F7F4] rounded-lg animate-pulse" />)}
            </div>
          ) : receipts.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-[#6B6960]">No payments yet</p>
              <p className="text-sm text-[#9C9B93] mt-1">Share your link to start receiving</p>
            </div>
          ) : (
            <div className="space-y-2">
              {receipts.slice(0, 5).map((r) => (
                <div key={r.txHash} className="flex items-center justify-between p-3 rounded-lg bg-[#FAFAF8]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#EDF5F0] flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#22C55E]">
                        <path d="M12 5V19M5 12L12 5L19 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#1C1B18]">From {formatAddress(r.from)}</p>
                      <p className="text-xs text-[#6B6960]">{formatDate(r.createdAt)} · {r.chain}</p>
                    </div>
                  </div>
                  <p className="font-medium text-[#1C1B18]">+{r.amount} {r.token}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customize Settings Toggle */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-[#6B6960] hover:text-[#1C1B18] transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={`transition-transform ${showSettings ? 'rotate-180' : ''}`}>
          <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {showSettings ? 'Hide settings' : 'Customize settings'}
      </button>

      {/* Settings Panel (Collapsed) */}
      {showSettings && (
        <Card className="border-[#E4E2DC] bg-white">
          <CardContent className="p-5 space-y-5">
            {/* Strategy Selection */}
            <div>
              <h3 className="font-medium text-[#1C1B18] mb-3">DeFi Strategy</h3>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'yield', label: 'Yield', desc: 'USDC → Aave', color: '#22C55E' },
                  { id: 'restaking', label: 'Restaking', desc: 'WETH → Renzo', color: '#7C3AED' },
                  { id: 'liquid', label: 'Liquid', desc: 'Keep USDC', color: '#6B7280' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStrategy(s.id)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      selectedStrategy === s.id ? 'border-[#1C1B18] bg-[#FAFAF8]' : 'border-[#E4E2DC]'
                    }`}
                  >
                    <p className="font-medium text-sm text-[#1C1B18]">{s.label}</p>
                    <p className="text-xs text-[#6B6960]">{s.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Vault Selection - only for yield strategy */}
            {selectedStrategy === 'yield' && (
              <div>
                <h3 className="font-medium text-[#1C1B18] mb-3">Yield Vault</h3>
                <div className="space-y-2">
                  {VAULT_OPTIONS.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVaultId(v.id)}
                      className={`w-full p-3 rounded-lg border-2 text-left transition-all flex items-center justify-between ${
                        selectedVaultId === v.id ? 'border-[#22C55E] bg-[#F0FDF4]' : 'border-[#E4E2DC]'
                      }`}
                    >
                      <div>
                        <p className="font-medium text-sm text-[#1C1B18]">{v.name}</p>
                        <p className="text-xs text-[#6B6960]">{v.protocol}</p>
                      </div>
                      {selectedVaultId === v.id && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#22C55E]">
                          <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Gas Tank - Add Funds */}
            <div>
              <h3 className="font-medium text-[#1C1B18] mb-3">Gas Tank</h3>
              <div className="p-4 rounded-lg bg-[#F8F7F4] space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#6B6960]">Current balance</span>
                  <span className="font-medium text-[#1C1B18]">
                    {gasTank.status?.balance ? `${parseFloat(gasTank.status.balance).toFixed(4)} ETH` : '0 ETH'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#6B6960]">Payments funded</span>
                  <span className="font-medium text-[#1C1B18]">
                    ~{gasTank.status?.estimatedPayments ?? 0}
                  </span>
                </div>
                <div className="flex gap-2 pt-2">
                  {['0.005', '0.01', '0.02'].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setDepositAmount(amt)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                        depositAmount === amt
                          ? 'bg-[#1C1B18] text-white'
                          : 'bg-white border border-[#E4E2DC] text-[#1C1B18]'
                      }`}
                    >
                      {amt} ETH
                    </button>
                  ))}
                </div>
                <Button
                  onClick={() => gasTank.deposit(depositAmount)}
                  disabled={gasTank.txPending}
                  className="w-full bg-[#1C1B18] hover:bg-[#2D2C28] text-white"
                >
                  {gasTank.txPending ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Adding...
                    </span>
                  ) : (
                    `Add ${depositAmount} ETH`
                  )}
                </Button>
                {gasTank.error && (
                  <p className="text-xs text-red-600">{gasTank.error}</p>
                )}
              </div>
            </div>

            {/* Save button */}
            {(vaultChanged || strategyChanged) && (
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-[#1C1B18] hover:bg-[#2D2C28] text-white"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Confirm in wallet...
                  </span>
                ) : (
                  'Save to ENS'
                )}
              </Button>
            )}

            {saveSuccess && saveTxHash && (
              <div className="rounded-lg bg-[#EDF5F0] p-3 text-sm text-[#2D6A4F]">
                Saved!{' '}
                <a href={`https://etherscan.io/tx/${saveTxHash}`} target="_blank" rel="noopener noreferrer" className="underline">
                  View tx
                </a>
              </div>
            )}

            {saveError && <p className="text-sm text-red-600">{saveError}</p>}

            {/* ENS link */}
            <a
              href={`https://app.ens.domains/${ensName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs text-[#6B6960] hover:text-[#1C1B18]"
            >
              Edit ENS profile →
            </a>
          </CardContent>
        </Card>
      )}

      {/* Invoice Modal */}
      <InvoiceModal
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        receiverAddress={address || ''}
        receiverEns={ensName || undefined}
      />
    </div>
  )
}

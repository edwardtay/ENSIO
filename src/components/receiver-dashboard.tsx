'use client'

import { useState, useEffect } from 'react'
import { useAccount, useSendTransaction, useSwitchChain } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useGasTank } from '@/hooks/use-gas-tank'

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

type Subscription = {
  id: string
  payer: string
  receiver: string
  amount: string
  frequency: 'weekly' | 'monthly'
  nextDue: string
  active: boolean
}

type AgentLog = {
  type: string
  receiver: string
  details: Record<string, unknown>
  timestamp: string
}

function useSubscriptions(address?: string) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!address) { setSubscriptions([]); return }
    setLoading(true)
    fetch(`/api/agent/cron?action=subscriptions&receiver=${address}`)
      .then((r) => r.json())
      .then((data) => setSubscriptions(data.subscriptions ?? []))
      .catch(() => setSubscriptions([]))
      .finally(() => setLoading(false))
  }, [address])

  return { subscriptions, loading }
}

function useAgentLog() {
  const [log, setLog] = useState<AgentLog[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch('/api/agent/cron?action=log')
      .then((r) => r.json())
      .then((data) => setLog(data.log ?? []))
      .catch(() => setLog([]))
      .finally(() => setLoading(false))
  }, [])

  return { log, loading }
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

function useEnsPreferences(ensName: string | null) {
  const [vault, setVault] = useState<string | null>(null)
  const [strategy, setStrategy] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!ensName) { setVault(null); setStrategy(null); setAvatar(null); return }
    setLoading(true)
    fetch(`/api/ens/resolve?name=${encodeURIComponent(ensName)}`)
      .then((r) => r.json())
      .then((data) => {
        setVault(data.yieldVault ?? null)
        setStrategy(data.strategy ?? null)
        if (data.avatar) {
          setAvatar(data.avatar.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${data.avatar.slice(7)}` : data.avatar)
        }
      })
      .catch(() => { setVault(null); setStrategy(null); setAvatar(null) })
      .finally(() => setLoading(false))
  }, [ensName])

  return { vault, strategy, avatar, loading }
}

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
  const { vault: currentVault, strategy: currentStrategy, avatar: ensAvatar, loading: prefsLoading } = useEnsPreferences(ensName)
  const { receipts, loading: receiptsLoading } = useReceipts(address)
  const { position: vaultPosition, loading: positionLoading } = useVaultPosition(currentVault ?? undefined, address)
  const gasTank = useGasTank()
  const { subscriptions, loading: subsLoading } = useSubscriptions(address)
  const { log: agentLog } = useAgentLog()

  const [showSettings, setShowSettings] = useState(false)
  const [depositAmount, setDepositAmount] = useState('0.005')
  const [selectedVaultId, setSelectedVaultId] = useState<string>('')
  const [selectedStrategy, setSelectedStrategy] = useState<string>('yield')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveTxHash, setSaveTxHash] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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
        <h1 className="text-3xl font-semibold text-[#1C1B18] mb-3">Accept Any Token</h1>
        <p className="text-[#6B6960] mb-8 text-center max-w-md text-lg">
          Get paid in any token on any chain. Auto-convert to USDC and earn yield.
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
          Get an ENS name to create your payment link.
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

      {/* Active Subscriptions */}
      <Card className="border-[#E4E2DC] bg-white">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[#1C1B18]">Subscriptions</h2>
            <div className="flex items-center gap-2 text-xs text-[#22C55E]">
              <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
              AI Agent Active
            </div>
          </div>
          {subsLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-12 bg-[#F8F7F4] rounded-lg animate-pulse" />)}
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#F8F7F4] flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#9C9B93]">
                  <path d="M12 2V6M12 18V22M6 12H2M22 12H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="text-[#6B6960]">No active subscriptions</p>
              <p className="text-sm text-[#9C9B93] mt-1">Share your link to get recurring payments</p>
            </div>
          ) : (
            <div className="space-y-2">
              {subscriptions.filter(s => s.active).map((sub) => (
                <div key={sub.id} className="flex items-center justify-between p-3 rounded-lg bg-[#FAFAF8]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#EDE9FE] flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#7C3AED]">
                        <path d="M12 2V6M12 18V22M6 12H2M22 12H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#1C1B18]">
                        {sub.payer.slice(0, 6)}...{sub.payer.slice(-4)}
                      </p>
                      <p className="text-xs text-[#6B6960]">
                        {sub.frequency} · Next: {new Date(sub.nextDue).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <p className="font-medium text-[#1C1B18]">${sub.amount}</p>
                </div>
              ))}
            </div>
          )}
          {/* Agent activity log */}
          {agentLog.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[#E4E2DC]">
              <p className="text-xs text-[#9C9B93] mb-2">Recent AI Agent Activity</p>
              <div className="space-y-1">
                {agentLog.slice(-3).reverse().map((entry, i) => (
                  <div key={i} className="text-xs text-[#6B6960] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
                    {entry.type === 'subscription_executed' && 'Processed subscription'}
                    {entry.type === 'tank_check' && 'Checked gas tank'}
                    {entry.type === 'tank_low' && 'Low tank alert'}
                    {entry.type === 'refill_initiated' && 'Initiated refill'}
                    <span className="text-[#9C9B93]">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
    </div>
  )
}

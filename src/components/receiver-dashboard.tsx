'use client'

import { useState, useEffect } from 'react'
import { useAccount, useSendTransaction, useSwitchChain } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useClientEnsPreferences } from '@/hooks/use-client-ens'

// Mock data for demo
const MOCK_RECEIPTS = [
  { txHash: '0xabc1', amount: '250.00', token: 'USDC', chain: 'Arbitrum', from: '0x742d35Cc6634C0532925a3b844Bc9e7595f8fE21', createdAt: '2026-02-06T10:30:00Z' },
  { txHash: '0xabc2', amount: '0.15', token: 'ETH', chain: 'Base', from: '0x8ba1f109551bD432803012645Ac136ddd64DBA72', createdAt: '2026-02-05T15:20:00Z' },
  { txHash: '0xabc3', amount: '500.00', token: 'USDC', chain: 'Ethereum', from: '0xdD4c825203f97984e7867F11eeCc813A036089D1', createdAt: '2026-02-04T09:15:00Z' },
]

const MOCK_BALANCES = [
  { chain: 'Arbitrum', token: 'USDT', amount: '125.50', usdValue: 125.50 },
  { chain: 'Optimism', token: 'DAI', amount: '89.20', usdValue: 89.20 },
  { chain: 'Polygon', token: 'USDC', amount: '45.00', usdValue: 45.00 },
]

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
  const { position: vaultPosition, loading: positionLoading } = useVaultPosition(currentVault ?? undefined, address)

  const [showSettings, setShowSettings] = useState(false)
  const [selectedStrategy, setSelectedStrategy] = useState<string>('liquid')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveTxHash, setSaveTxHash] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [consolidating, setConsolidating] = useState(false)

  useEffect(() => {
    if (currentStrategy) setSelectedStrategy(currentStrategy)
  }, [currentStrategy])

  const strategyChanged = currentStrategy ? selectedStrategy !== currentStrategy : selectedStrategy !== 'liquid'
  const totalScattered = MOCK_BALANCES.reduce((sum, b) => sum + b.usdValue, 0)

  const handleSave = async () => {
    if (!ensName) return
    setSaving(true)
    setSaveSuccess(false)
    setSaveTxHash(null)
    setSaveError(null)

    try {
      if (chainId !== 1) await switchChainAsync({ chainId: 1 })

      const res = await fetch('/api/ens/set-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ensName, strategy: selectedStrategy }),
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

  const handleConsolidate = async () => {
    setConsolidating(true)
    // Simulate consolidation
    await new Promise(r => setTimeout(r, 2000))
    setConsolidating(false)
    alert('Consolidation would route all tokens to your preferred chain via LI.FI')
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
          One link for all payments. Any token, any chain.
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
          Your ENS name becomes your payment link.
        </p>
        <a
          href="https://app.ens.domains"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#1C1B18] text-white font-medium hover:bg-[#2D2C28] transition-colors"
        >
          Get ENS Name
        </a>
      </div>
    )
  }

  const paymentLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/pay/${ensName}`
  const strategyLabel = currentStrategy === 'yield' ? 'Earning Yield' : 'USDC (Liquid)'

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
            <div className="p-2 bg-white rounded-lg border border-[#E4E2DC] shrink-0">
              <QRCodeSVG value={paymentLink} size={100} level="M" bgColor="#FFFFFF" fgColor="#1C1B18" />
            </div>
            <div className="flex-1 space-y-3">
              <div className="p-2.5 bg-[#F8F7F4] rounded-lg">
                <p className="font-mono text-xs text-[#1C1B18] break-all">{paymentLink}</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCopy} variant="outline" className="flex-1 h-9 text-sm border-[#E4E2DC]">
                  {copied ? 'Copied!' : 'Copy Link'}
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
                  ${vaultPosition?.assets ?? '1,250.00'}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-[#6B6960]">Yield earned</p>
              <p className="text-2xl font-semibold text-[#22C55E]">
                +${vaultPosition?.earned ?? '12.50'}
              </p>
            </div>
          </div>
          <p className="text-xs text-[#6B6960] mt-3 pt-3 border-t border-[#E4E2DC]">
            {strategyLabel} · {vaultPosition?.apy ?? '~5'}% APY
          </p>
        </CardContent>
      </Card>

      {/* Consolidate Card */}
      {totalScattered > 0 && (
        <Card className="border-[#E4E2DC] bg-white">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#FFF3E0] flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#E65100]">
                    <path d="M4 4H10V10H4V4Z" stroke="currentColor" strokeWidth="2"/>
                    <path d="M14 4H20V10H14V4Z" stroke="currentColor" strokeWidth="2"/>
                    <path d="M4 14H10V20H4V14Z" stroke="currentColor" strokeWidth="2"/>
                    <path d="M17 14V20M14 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-[#1C1B18]">Scattered Balances</p>
                  <p className="text-sm text-[#6B6960]">${totalScattered.toFixed(2)} across {MOCK_BALANCES.length} chains</p>
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              {MOCK_BALANCES.map((b, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded bg-[#F8F7F4] text-sm">
                  <span className="text-[#6B6960]">{b.chain}</span>
                  <span className="font-medium text-[#1C1B18]">{b.amount} {b.token}</span>
                </div>
              ))}
            </div>

            <Button
              onClick={handleConsolidate}
              disabled={consolidating}
              className="w-full bg-[#1C1B18] hover:bg-[#2D2C28] text-white"
            >
              {consolidating ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Consolidating...
                </span>
              ) : (
                'Consolidate to Base'
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Recent Payments */}
      <Card className="border-[#E4E2DC] bg-white">
        <CardContent className="p-5">
          <h2 className="font-semibold text-[#1C1B18] mb-3">Recent Payments</h2>
          <div className="space-y-2">
            {MOCK_RECEIPTS.map((r) => (
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
        </CardContent>
      </Card>

      {/* Settings Toggle */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-[#6B6960] hover:text-[#1C1B18] transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={`transition-transform ${showSettings ? 'rotate-180' : ''}`}>
          <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {showSettings ? 'Hide settings' : 'Customize settings'}
      </button>

      {/* Settings Panel */}
      {showSettings && (
        <Card className="border-[#E4E2DC] bg-white">
          <CardContent className="p-5 space-y-5">
            <div>
              <h3 className="font-medium text-[#1C1B18] mb-3">Receive As</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'liquid', label: 'USDC', desc: 'Instant access' },
                  { id: 'yield', label: 'Earn Yield', desc: 'Auto-deposit (~5% APY)' },
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

            {strategyChanged && (
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

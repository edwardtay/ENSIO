'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface Props {
  ensName?: string
  onComplete?: () => void
}

const STRATEGIES = [
  { id: 'liquid', label: 'Keep as USDC', desc: 'Instant access, no lock-up', apy: 'Stable' },
  { id: 'restaking', label: 'Earn with ETH', desc: 'Convert to ezETH for staking rewards', apy: '~8% APY' },
] as const

export function ReceiverSetup({ ensName, onComplete }: Props) {
  const { address, isConnected } = useAccount()
  const [done, setDone] = useState(false)
  const [selectedStrategy, setSelectedStrategy] = useState('liquid')
  const [saving, setSaving] = useState(false)

  const handleActivate = async () => {
    setSaving(true)
    // In production, this would set ENS text records
    await new Promise(r => setTimeout(r, 1000))
    setSaving(false)
    setDone(true)
    onComplete?.()
  }

  if (!isConnected) {
    return (
      <Card className="border-[#E4E2DC] bg-white max-w-md mx-auto">
        <CardContent className="p-6 text-center space-y-4">
          <h2 className="text-xl font-semibold text-[#1C1B18]">
            Accept Any Token
          </h2>
          <p className="text-sm text-[#6B6960]">
            Connect wallet to set up your payment preferences.
          </p>
          <ConnectButton />
        </CardContent>
      </Card>
    )
  }

  if (done) {
    return (
      <Card className="border-[#E4E2DC] bg-white max-w-md mx-auto">
        <CardContent className="p-6 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-[#22C55E] flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-white">
              <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[#1C1B18]">You&apos;re live!</h2>
            <p className="text-sm text-[#6B6960] mt-1">Share your link to get paid.</p>
          </div>

          <div className="rounded-lg bg-[#F8F7F4] p-4">
            <p className="font-mono text-[#1C1B18] break-all">
              flowfi.xyz/pay/{ensName || address?.slice(0, 10)}
            </p>
          </div>

          <p className="text-xs text-[#6B6960]">
            Payments auto-convert to dollars and go to your account.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-[#E4E2DC] bg-white max-w-md mx-auto">
      <CardContent className="p-6 space-y-5">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-[#1C1B18]">
            Choose How to Receive
          </h2>
          <p className="text-sm text-[#6B6960] mt-1">
            Where should incoming payments go?
          </p>
        </div>

        {/* Strategy selection */}
        <div className="space-y-2">
          {STRATEGIES.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedStrategy(s.id)}
              className={`w-full p-4 rounded-lg border-2 text-left transition-all flex items-center justify-between ${
                selectedStrategy === s.id
                  ? 'border-[#22C55E] bg-[#F0FDF4]'
                  : 'border-[#E4E2DC] bg-white'
              }`}
            >
              <div>
                <p className="font-medium text-[#1C1B18]">{s.label}</p>
                <p className="text-sm text-[#6B6960]">{s.desc}</p>
              </div>
              <span className={`text-sm font-medium ${selectedStrategy === s.id ? 'text-[#22C55E]' : 'text-[#9C9B93]'}`}>
                {s.apy}
              </span>
            </button>
          ))}
        </div>

        {/* What happens */}
        <div className="rounded-lg bg-[#F8F7F4] p-4 space-y-2">
          <p className="text-xs text-[#9C9B93] text-center mb-2">WHEN SOMEONE PAYS YOU</p>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-5 h-5 rounded-full bg-[#1C1B18] text-white text-xs flex items-center justify-center">1</span>
            <span className="text-[#6B6960]">They pay with any crypto, any network</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-5 h-5 rounded-full bg-[#1C1B18] text-white text-xs flex items-center justify-center">2</span>
            <span className="text-[#6B6960]">Auto-converted to dollars (USDC)</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-5 h-5 rounded-full bg-[#22C55E] text-white text-xs flex items-center justify-center">✓</span>
            <span className="text-[#6B6960]">{selectedStrategy === 'restaking' ? 'Growing via ETH staking' : 'Ready to use instantly'}</span>
          </div>
        </div>

        <Button
          onClick={handleActivate}
          disabled={saving}
          className="w-full h-12 bg-[#1C1B18] hover:bg-[#2D2C28] text-white font-medium"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              Setting up...
            </span>
          ) : (
            'Create Payment Link'
          )}
        </Button>

        <p className="text-xs text-center text-[#9C9B93]">
          Your preferences are saved to your account. Change anytime.
        </p>
      </CardContent>
    </Card>
  )
}

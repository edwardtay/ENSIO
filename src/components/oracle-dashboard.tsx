'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { OracleState, FeeAdjustmentResult } from '@/lib/agent/oracle-agent'

type LogEntry = {
  id: string
  timestamp: number
  message: string
  type: 'analysis' | 'adjustment' | 'error' | 'info'
}

const PEG_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  tight: { bg: 'bg-[#EDF5F0]', text: 'text-[#2D6A4F]', label: 'TIGHT PEG' },
  normal: { bg: 'bg-[#F2F0EB]', text: 'text-[#6B6A63]', label: 'NORMAL' },
  stressed: { bg: 'bg-[#FEF9E7]', text: 'text-[#92400E]', label: 'STRESSED' },
  depegged: { bg: 'bg-[#FEF2F2]', text: 'text-[#991B1B]', label: 'DEPEG' },
}

const TIER_STYLES: Record<string, string> = {
  stable: 'bg-[#EDF5F0] text-[#2D6A4F] border-[#B7D4C7]',
  low: 'bg-[#F2F0EB] text-[#6B6A63] border-[#E4E2DC]',
  medium: 'bg-[#FEF9E7] text-[#92400E] border-[#E5D5A0]',
  high: 'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]',
}

export function OracleDashboard() {
  const [state, setState] = useState<OracleState | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isAdjusting, setIsAdjusting] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [lastTxHash, setLastTxHash] = useState<string | null>(null)

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs((prev) => [
      { id: crypto.randomUUID(), timestamp: Date.now(), message, type },
      ...prev,
    ].slice(0, 50))
  }, [])

  const fetchState = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/oracle')
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data: OracleState = await res.json()
      setState(data)
      addLog(
        `Analyzed: USDC $${data.analysis.usdcPrice.price.toFixed(4)}, USDT $${data.analysis.usdtPrice.price.toFixed(4)} — deviation ${data.analysis.pegDeviationPercent}`,
        'analysis'
      )
      if (data.recommendation.shouldAdjust) {
        addLog(
          `Fee adjustment needed: ${data.recommendation.currentFeeLabel} → ${data.recommendation.recommendedFeeLabel}`,
          'info'
        )
      }
    } catch (err) {
      addLog(
        `Failed to fetch oracle state: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'error'
      )
    } finally {
      setIsLoading(false)
    }
  }, [addLog])

  const adjustFee = useCallback(async () => {
    if (!state) return
    setIsAdjusting(true)
    try {
      const res = await fetch('/api/oracle/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fee: state.recommendation.recommendedFee }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `API error: ${res.status}`)
      }
      const result: FeeAdjustmentResult = await res.json()
      if (result.txHash) setLastTxHash(result.txHash)
      addLog(
        `Fee adjusted on-chain: ${(result.previousFee / 10000).toFixed(2)}% → ${(result.newFee / 10000).toFixed(2)}% (tx: ${result.txHash?.slice(0, 10)}...)`,
        'adjustment'
      )
      // Re-fetch to show updated state
      await fetchState()
    } catch (err) {
      addLog(
        `Fee adjustment failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'error'
      )
    } finally {
      setIsAdjusting(false)
    }
  }, [state, addLog, fetchState])

  // Auto-fetch on mount
  useEffect(() => {
    fetchState()
  }, [fetchState])

  const pegStyle = state ? PEG_STATUS_STYLES[state.analysis.pegStatus] || PEG_STATUS_STYLES.tight : null

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Title */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#1C1B18] font-[family-name:var(--font-display)]">AI Oracle Dashboard</h2>
            <p className="text-xs text-[#9C9B93] mt-0.5">Dynamic fee management for USDC/USDT pool on Base</p>
          </div>
          <Button
            onClick={fetchState}
            disabled={isLoading}
            className="h-8 px-3 bg-[#1C1B18] hover:bg-[#2D2C28] text-[#F8F7F4] rounded-lg text-xs font-medium disabled:opacity-40 cursor-pointer shadow-sm"
          >
            {isLoading ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing
              </span>
            ) : (
              'Refresh Analysis'
            )}
          </Button>
        </div>

        {/* Price Cards */}
        {state && (
          <div className="grid grid-cols-3 gap-3">
            {/* USDC Price */}
            <Card className="bg-white border border-[#E4E2DC] rounded-xl py-0">
              <CardContent className="p-3 text-center">
                <span className="text-[10px] font-medium text-[#9C9B93] uppercase tracking-wide">USDC</span>
                <p className="text-lg font-bold font-mono text-[#1C1B18] mt-0.5">
                  ${state.analysis.usdcPrice.price.toFixed(4)}
                </p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${state.analysis.usdcPrice.confidence >= 0.9 ? 'bg-[#2D6A4F]' : state.analysis.usdcPrice.confidence >= 0.7 ? 'bg-[#A17D2F]' : 'bg-[#C53030]'}`} />
                  <span className="text-[9px] text-[#9C9B93]">{(state.analysis.usdcPrice.confidence * 100).toFixed(0)}% conf</span>
                </div>
              </CardContent>
            </Card>

            {/* USDT Price */}
            <Card className="bg-white border border-[#E4E2DC] rounded-xl py-0">
              <CardContent className="p-3 text-center">
                <span className="text-[10px] font-medium text-[#9C9B93] uppercase tracking-wide">USDT</span>
                <p className="text-lg font-bold font-mono text-[#1C1B18] mt-0.5">
                  ${state.analysis.usdtPrice.price.toFixed(4)}
                </p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${state.analysis.usdtPrice.confidence >= 0.9 ? 'bg-[#2D6A4F]' : state.analysis.usdtPrice.confidence >= 0.7 ? 'bg-[#A17D2F]' : 'bg-[#C53030]'}`} />
                  <span className="text-[9px] text-[#9C9B93]">{(state.analysis.usdtPrice.confidence * 100).toFixed(0)}% conf</span>
                </div>
              </CardContent>
            </Card>

            {/* Peg Deviation */}
            <Card className={`border rounded-xl py-0 ${pegStyle?.bg || 'bg-white'} ${pegStyle ? 'border-current/20' : 'border-[#E4E2DC]'}`}>
              <CardContent className="p-3 text-center">
                <span className="text-[10px] font-medium text-[#9C9B93] uppercase tracking-wide">Peg Deviation</span>
                <p className={`text-lg font-bold font-mono mt-0.5 ${pegStyle?.text || 'text-[#1C1B18]'}`}>
                  {state.analysis.pegDeviationPercent}
                </p>
                <Badge variant="secondary" className={`text-[8px] mt-1 ${pegStyle?.bg || ''} ${pegStyle?.text || ''}`}>
                  {pegStyle?.label || 'UNKNOWN'}
                </Badge>
              </CardContent>
            </Card>
          </div>
        )}

        {/* AI Reasoning */}
        {state && (
          <Card className="bg-white border border-[#E4E2DC] rounded-xl py-0">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[#1C1B18]">AI Agent Reasoning</h3>
                <Badge variant="secondary" className="text-[9px] bg-[#F5EFE0] text-[#A17D2F] border-[#DDD0B5]">
                  Uniswap v4 Hook
                </Badge>
              </div>
              <div className="space-y-2">
                {state.recommendation.reasoning.map((step, i) => (
                  <div key={i} className="flex gap-2.5 text-xs">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-[#F5EFE0] text-[#A17D2F] flex items-center justify-center text-[10px] font-bold mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-[#6B6A63] leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Fee Status + Adjustment */}
        {state && (
          <Card className="bg-white border border-[#E4E2DC] rounded-xl py-0">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-[#1C1B18]">Fee Management</h3>

              <div className="grid grid-cols-2 gap-3">
                {/* Current Fee */}
                <div className="px-3 py-2.5 rounded-lg bg-[#F8F7F4] border border-[#E4E2DC]">
                  <span className="text-[10px] text-[#9C9B93] font-medium uppercase">Current On-Chain Fee</span>
                  <p className="text-xl font-bold font-mono text-[#1C1B18] mt-0.5">
                    {state.recommendation.currentFeeLabel}
                  </p>
                  <span className="text-[10px] text-[#9C9B93]">({state.recommendation.currentFee} hundredths bip)</span>
                </div>

                {/* Recommended Fee */}
                <div className={`px-3 py-2.5 rounded-lg border ${TIER_STYLES[state.recommendation.recommendedTier] || 'bg-[#F8F7F4] border-[#E4E2DC]'}`}>
                  <span className="text-[10px] font-medium uppercase opacity-70">AI Recommended</span>
                  <p className="text-xl font-bold font-mono mt-0.5">
                    {state.recommendation.recommendedFeeLabel}
                  </p>
                  <span className="text-[10px] opacity-70">{state.recommendation.recommendedTier} tier</span>
                </div>
              </div>

              {/* Confidence Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#6B6A63]">AI Confidence</span>
                  <span className="font-mono text-[#1C1B18] font-medium">{(state.recommendation.confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="w-full h-2 bg-[#F2F0EB] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      state.recommendation.confidence >= 0.9
                        ? 'bg-[#2D6A4F]'
                        : state.recommendation.confidence >= 0.7
                        ? 'bg-[#A17D2F]'
                        : 'bg-[#C53030]'
                    }`}
                    style={{ width: `${state.recommendation.confidence * 100}%` }}
                  />
                </div>
              </div>

              {/* Adjust Button */}
              {state.recommendation.shouldAdjust ? (
                <Button
                  onClick={adjustFee}
                  disabled={isAdjusting}
                  className="w-full h-10 bg-[#1C1B18] hover:bg-[#2D2C28] text-[#F8F7F4] rounded-xl font-medium disabled:opacity-40 cursor-pointer shadow-md"
                >
                  {isAdjusting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Adjusting On-Chain...
                    </span>
                  ) : (
                    `Adjust Fee: ${state.recommendation.currentFeeLabel} → ${state.recommendation.recommendedFeeLabel}`
                  )}
                </Button>
              ) : (
                <div className="w-full h-10 bg-[#EDF5F0] border border-[#B7D4C7] rounded-xl flex items-center justify-center">
                  <span className="text-xs text-[#2D6A4F] font-medium">Fee is optimal — no adjustment needed</span>
                </div>
              )}

              {/* Tx Hash */}
              {lastTxHash && (
                <a
                  href={`https://basescan.org/tx/${lastTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-xs text-[#A17D2F] hover:text-[#8B6B27] font-medium underline underline-offset-2"
                >
                  Last adjustment tx: {lastTxHash.slice(0, 10)}...{lastTxHash.slice(-8)}
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {/* Pool Stats */}
        {state && (
          <Card className="bg-white border border-[#E4E2DC] rounded-xl py-0">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-[#1C1B18] mb-2">Pool Info</h3>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#9C9B93]">Hook</span>
                  <span className="font-mono text-[#6B6A63]">{state.hookAddress.slice(0, 10)}...{state.hookAddress.slice(-8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9C9B93]">Pool ID</span>
                  <span className="font-mono text-[#6B6A63]">{state.poolId.slice(0, 10)}...{state.poolId.slice(-8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9C9B93]">Oracle</span>
                  <span className="font-mono text-[#6B6A63]">{state.oracleAddress.slice(0, 10)}...{state.oracleAddress.slice(-8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9C9B93]">Swap Count</span>
                  <span className="font-mono text-[#6B6A63]">{state.poolStats.swapCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9C9B93]">Total Volume</span>
                  <span className="font-mono text-[#6B6A63]">{state.poolStats.totalVolume}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9C9B93]">Chain</span>
                  <span className="font-mono text-[#6B6A63]">Base (8453)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Activity Log */}
        {logs.length > 0 && (
          <Card className="bg-white border border-[#E4E2DC] rounded-xl py-0">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold text-[#1C1B18]">Agent Activity Log</h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-2 text-[11px]">
                    <span className="shrink-0 text-[#9C9B93] font-mono">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className={`shrink-0 px-1 rounded text-[9px] font-bold uppercase ${
                      log.type === 'adjustment' ? 'bg-[#F5EFE0] text-[#A17D2F]' :
                      log.type === 'analysis' ? 'bg-[#F2F0EB] text-[#6B6A63]' :
                      log.type === 'error' ? 'bg-[#FEF2F2] text-[#991B1B]' :
                      'bg-[#F2F0EB] text-[#6B6A63]'
                    }`}>
                      {log.type}
                    </span>
                    <span className="text-[#6B6A63] break-all">{log.message}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  )
}

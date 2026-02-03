'use client'

import { useState, useCallback } from 'react'
import { useAccount, useSendTransaction } from 'wagmi'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { TokenBalance, ConsolidationStep, ConsolidationPlan } from '@/lib/agent/consolidation'

type ConsolidationAPIResponse = {
  balances: TokenBalance[]
  opportunities: TokenBalance[]
  plan: ConsolidationPlan
  ensConfig: {
    preferredToken?: string
    preferredChain?: string
    autoConsolidate?: string
  }
}

const CHAIN_COLORS: Record<string, string> = {
  base: 'bg-[#F2F0EB] text-[#6B6A63] border-[#E4E2DC]',
  ethereum: 'bg-[#F2F0EB] text-[#6B6A63] border-[#E4E2DC]',
  arbitrum: 'bg-[#F2F0EB] text-[#6B6A63] border-[#E4E2DC]',
  optimism: 'bg-[#F2F0EB] text-[#6B6A63] border-[#E4E2DC]',
}

const STEP_ICONS: Record<ConsolidationStep['type'], string> = {
  'v4-hook-swap': 'Swap',
  'lifi-bridge': 'Bridge',
  'lifi-swap': 'Swap',
  'gold-conversion': 'Gold',
}

export function ConsolidationPanel() {
  const { address } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const [data, setData] = useState<ConsolidationAPIResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ensName, setEnsName] = useState('')

  const scanBalances = useCallback(async () => {
    if (!address) return
    setIsLoading(true)
    setError(null)
    setTxHash(null)

    try {
      const res = await fetch('/api/consolidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          ensName: ensName || undefined,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `API error: ${res.status}`)
      }

      const result = await res.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan balances')
    } finally {
      setIsLoading(false)
    }
  }, [address, ensName])

  const executeConsolidation = useCallback(async () => {
    if (!address || !data) return

    const hookStep = data.plan.steps.find((s) => s.type === 'v4-hook-swap' && s.executable)
    if (!hookStep) return

    setIsExecuting(true)
    try {
      // Build the v4 swap via the execute API
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeId: 'v4-consolidate',
          fromAddress: address,
          intent: {
            action: 'swap',
            amount: hookStep.from.amount,
            fromToken: hookStep.from.token,
            toToken: hookStep.to.token,
            fromChain: hookStep.from.chain,
            toChain: hookStep.to.chain,
          },
          slippage: 0.005,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Execute error: ${res.status}`)
      }

      let txData = await res.json()

      // Handle multi-step approvals for v4 swaps
      while (txData.provider?.startsWith('Approval:')) {
        await sendTransactionAsync({
          to: txData.to as `0x${string}`,
          data: txData.data as `0x${string}`,
          value: txData.value ? BigInt(txData.value) : BigInt(0),
        })

        // Re-fetch to get next step (or the actual swap)
        const nextRes = await fetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            routeId: 'v4-consolidate',
            fromAddress: address,
            intent: {
              action: 'swap',
              amount: hookStep.from.amount,
              fromToken: hookStep.from.token,
              toToken: hookStep.to.token,
              fromChain: hookStep.from.chain,
              toChain: hookStep.to.chain,
            },
            slippage: 0.005,
          }),
        })

        if (!nextRes.ok) {
          const errData = await nextRes.json().catch(() => ({}))
          throw new Error(errData.error || `Execute error: ${nextRes.status}`)
        }

        txData = await nextRes.json()
      }

      const hash = await sendTransactionAsync({
        to: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        value: txData.value ? BigInt(txData.value) : BigInt(0),
      })
      setTxHash(hash)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      setError(msg)
    } finally {
      setIsExecuting(false)
    }
  }, [address, data, sendTransactionAsync])

  if (!address) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-[#F2F0EB] flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#9C9B93]">
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.5" />
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm text-[#6B6A63]">Connect your wallet to scan balances and consolidate</p>
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* ENS Config Input */}
        <Card className="bg-white border border-[#E4E2DC] rounded-xl py-0">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#1C1B18]">Store of Value Preference</h3>
                <p className="text-xs text-[#9C9B93] mt-0.5">Set via ENS text records or enter ENS name to load</p>
              </div>
              <Badge variant="secondary" className="text-[10px] bg-[#F5EFE0] text-[#A17D2F] border-[#DDD0B5]">
                ENS
              </Badge>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={ensName}
                onChange={(e) => setEnsName(e.target.value)}
                placeholder="yourname.eth"
                className="flex-1 h-9 px-3 text-sm bg-[#F8F7F4] border border-[#E4E2DC] rounded-lg focus:ring-2 focus:ring-[#A17D2F]/20 focus:border-[#DDD0B5] outline-none transition-colors"
              />
              <Button
                onClick={scanBalances}
                disabled={isLoading}
                className="h-9 px-4 bg-[#1C1B18] hover:bg-[#2D2C28] text-[#F8F7F4] rounded-lg text-sm font-medium disabled:opacity-40 cursor-pointer shadow-sm"
              >
                {isLoading ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 border-2 border-[#F8F7F4]/30 border-t-[#F8F7F4] rounded-full animate-spin" />
                    Scanning
                  </span>
                ) : (
                  'Scan & Plan'
                )}
              </Button>
            </div>

            {data?.ensConfig && (
              <div className="flex gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#EDF5F0] text-[#2D6A4F] border border-[#B7D4C7]">
                  Target: {data.ensConfig.preferredToken || 'USDC'}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#F2F0EB] text-[#6B6A63] border border-[#E4E2DC]">
                  Chain: {data.ensConfig.preferredChain || 'base'}
                </span>
                {data.ensConfig.autoConsolidate === 'true' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[#FEF9E7] text-[#92400E] border border-[#E5D5A0]">
                    Auto-consolidate: ON
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <Card className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl py-0">
            <CardContent className="p-3">
              <p className="text-xs text-[#991B1B]">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Balances */}
        {data && (
          <>
            <Card className="bg-white border border-[#E4E2DC] rounded-xl py-0">
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold text-[#1C1B18]">Wallet Balances</h3>
                {data.balances.length === 0 ? (
                  <p className="text-xs text-[#9C9B93]">No token balances found across supported chains.</p>
                ) : (
                  <div className="space-y-1.5">
                    {data.balances.map((b, i) => {
                      const isTarget =
                        b.token.toUpperCase() === (data.ensConfig.preferredToken || 'USDC').toUpperCase() &&
                        b.chain.toLowerCase() === (data.ensConfig.preferredChain || 'base').toLowerCase()
                      return (
                        <div
                          key={`${b.chain}-${b.token}-${i}`}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${
                            isTarget
                              ? 'bg-[#EDF5F0] border-[#B7D4C7]'
                              : 'bg-[#F8F7F4] border-[#E4E2DC]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className={`text-[9px] font-semibold ${CHAIN_COLORS[b.chain] || 'bg-[#F2F0EB] text-[#6B6A63] border-[#E4E2DC]'}`}
                            >
                              {b.chain}
                            </Badge>
                            <span className="font-medium text-[#1C1B18]">{b.token}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-mono text-[#1C1B18]">{b.balanceFormatted}</span>
                            <span className="text-xs text-[#9C9B93] ml-1.5">(${b.balanceUSD})</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Opportunities */}
            {data.opportunities.length > 0 && (
              <Card className="bg-white border border-[#E4E2DC] rounded-xl py-0">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#1C1B18]">Consolidation Needed</h3>
                    <span className="text-xs text-[#92400E] font-medium">
                      {data.opportunities.length} token{data.opportunities.length > 1 ? 's' : ''} to convert
                    </span>
                  </div>
                  {data.opportunities.map((opp, i) => (
                    <div
                      key={`opp-${i}`}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#FEF9E7] border border-[#E5D5A0] text-sm"
                    >
                      <span className="text-[#92400E]">
                        {opp.balanceFormatted} {opp.token} on {opp.chain}
                      </span>
                      <span className="text-xs text-[#92400E]">
                        → should be {data.ensConfig.preferredToken || 'USDC'}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Consolidation Plan */}
            {data.plan.steps.length > 0 && (
              <Card className="bg-white border border-[#E4E2DC] rounded-xl py-0">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[#1C1B18]">Consolidation Plan</h3>
                    {data.plan.totalSavings !== '$0.00' && (
                      <span className="text-xs text-[#2D6A4F] font-semibold">
                        Save {data.plan.totalSavings} vs standard fees
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {data.plan.steps.map((step, i) => (
                      <div
                        key={`step-${i}`}
                        className={`px-3 py-2.5 rounded-lg border text-sm ${
                          step.type === 'v4-hook-swap'
                            ? 'bg-[#F5EFE0] border-[#DDD0B5]'
                            : step.type === 'gold-conversion'
                            ? 'bg-[#FEF9E7] border-[#E5D5A0]'
                            : 'bg-[#F2F0EB] border-[#E4E2DC]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-[#6B6A63]">Step {i + 1}</span>
                              <Badge
                                variant="secondary"
                                className={`text-[9px] ${
                                  step.type === 'v4-hook-swap'
                                    ? 'bg-[#F5EFE0] text-[#A17D2F] border-[#DDD0B5]'
                                    : step.type === 'gold-conversion'
                                    ? 'bg-[#FEF9E7] text-[#92400E] border-[#E5D5A0]'
                                    : 'bg-[#F2F0EB] text-[#6B6A63] border-[#E4E2DC]'
                                }`}
                              >
                                {STEP_ICONS[step.type]}
                              </Badge>
                              <Badge variant="secondary" className="text-[9px] bg-[#F2F0EB] text-[#6B6A63] border-[#E4E2DC]">
                                {step.provider}
                              </Badge>
                            </div>
                            <p className="text-[#1C1B18] text-xs leading-relaxed">{step.description}</p>
                            <div className="flex items-center gap-3 text-[11px] text-[#9C9B93]">
                              <span>
                                Fee: <span className={step.type === 'v4-hook-swap' ? 'text-[#2D6A4F] font-semibold' : 'text-[#6B6A63]'}>{step.feePercent}</span>
                              </span>
                              <span className="text-[#E4E2DC]">|</span>
                              <span>ETA: <span className="text-[#6B6A63]">{step.estimatedTime}</span></span>
                            </div>
                          </div>
                          {step.executable && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#EDF5F0] text-[#2D6A4F] border border-[#B7D4C7]">
                              LIVE
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Fee Comparison */}
                  {data.plan.steps.some((s) => s.type === 'v4-hook-swap') && (
                    <div className="mt-2 px-3 py-2 rounded-lg bg-[#EDF5F0] border border-[#B7D4C7]">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#2D6A4F] font-medium">PayAgent Hook fee</span>
                        <span className="font-mono text-[#2D6A4F] font-bold">0.01%</span>
                      </div>
                      <div className="flex items-center justify-between text-xs mt-1">
                        <span className="text-[#6B6A63]">Standard pool fee</span>
                        <span className="font-mono text-[#6B6A63] line-through">0.30%</span>
                      </div>
                      <div className="flex items-center justify-between text-xs mt-1 pt-1 border-t border-[#B7D4C7]">
                        <span className="text-[#2D6A4F] font-semibold">You save</span>
                        <span className="font-mono text-[#2D6A4F] font-bold">{data.plan.totalSavings}</span>
                      </div>
                    </div>
                  )}

                  {/* Gold Conversion Display */}
                  {data.plan.goldConversion && (
                    <div className="mt-2 px-3 py-2 rounded-lg bg-[#FEF9E7] border border-[#E5D5A0]">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-xs font-semibold text-[#92400E]">Gold (PAXG) Conversion</span>
                        <Badge variant="secondary" className="text-[9px] bg-[#FEF9E7] text-[#92400E] border-[#E5D5A0]">
                          LI.FI Quote
                        </Badge>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-[#92400E]">Amount</span>
                          <span className="font-mono text-[#1C1B18]">${data.plan.goldConversion.amountUSDC} USDC</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#92400E]">Estimated PAXG</span>
                          <span className="font-mono text-[#1C1B18]">{data.plan.goldConversion.estimatedPAXG} PAXG</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#92400E]">Gold Price</span>
                          <span className="font-mono text-[#1C1B18]">${data.plan.goldConversion.goldPriceUSD.toLocaleString()}/oz</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Execute Button */}
                  {data.plan.steps.some((s) => s.executable) && (
                    <Button
                      onClick={executeConsolidation}
                      disabled={isExecuting}
                      className="w-full h-10 bg-[#1C1B18] hover:bg-[#2D2C28] text-[#F8F7F4] rounded-xl font-medium disabled:opacity-40 cursor-pointer shadow-md shadow-[#1C1B18]/10"
                    >
                      {isExecuting ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-[#F8F7F4]/30 border-t-[#F8F7F4] rounded-full animate-spin" />
                          Executing...
                        </span>
                      ) : (
                        'Consolidate via PayAgent Hook'
                      )}
                    </Button>
                  )}

                  {/* Tx Hash */}
                  {txHash && (
                    <a
                      href={`https://basescan.org/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-center text-xs text-[#A17D2F] hover:text-[#866621] font-medium underline underline-offset-2"
                    >
                      View transaction: {txHash.slice(0, 10)}...{txHash.slice(-8)}
                    </a>
                  )}
                </CardContent>
              </Card>
            )}

            {/* No opportunities */}
            {data.opportunities.length === 0 && data.balances.length > 0 && (
              <Card className="bg-[#EDF5F0] border border-[#B7D4C7] rounded-xl py-0">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-[#2D6A4F] font-medium">
                    All balances match your preferred store of value. Nothing to consolidate.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </ScrollArea>
  )
}

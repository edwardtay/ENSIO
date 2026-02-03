'use client'

import { cn } from '@/lib/utils'
import type { RouteOption, ParsedIntent } from '@/lib/types'

type RouteVisualizerProps = {
  route: RouteOption
  intent?: ParsedIntent
}

/** Map chain names to their brand colors for warm Gold Standard theme */
function getChainColor(chain: string): { bg: string; border: string; text: string; dot: string } {
  const lower = chain.toLowerCase()
  if (lower.includes('base'))
    return { bg: 'bg-[#EBF2FE]', border: 'border-[#C4D6F0]', text: 'text-[#3B6EB5]', dot: 'bg-[#3B82F6]' }
  if (lower.includes('arbitrum'))
    return { bg: 'bg-[#F5EFE0]', border: 'border-[#DDD0B5]', text: 'text-[#9C6A2F]', dot: 'bg-[#B8860B]' }
  if (lower.includes('optimism'))
    return { bg: 'bg-[#FEF2F2]', border: 'border-[#FECACA]', text: 'text-[#991B1B]', dot: 'bg-[#C53030]' }
  if (lower.includes('unichain'))
    return { bg: 'bg-[#F5EFE0]', border: 'border-[#DDD0B5]', text: 'text-[#9C6A2F]', dot: 'bg-[#B8860B]' }
  if (lower.includes('ethereum') || lower.includes('mainnet'))
    return { bg: 'bg-[#F2F0EB]', border: 'border-[#E4E2DC]', text: 'text-[#6B6A63]', dot: 'bg-[#6B6A63]' }
  if (lower.includes('polygon'))
    return { bg: 'bg-[#F2F0EB]', border: 'border-[#E4E2DC]', text: 'text-[#6B6A63]', dot: 'bg-[#6B6A63]' }
  return { bg: 'bg-[#F2F0EB]', border: 'border-[#E4E2DC]', text: 'text-[#6B6A63]', dot: 'bg-[#9C9B93]' }
}

/** Parse route.path string like "Base USDC -> Arbitrum USDC" into steps */
function parseRoutePath(path: string, intent?: ParsedIntent) {
  // Attempt to split on common delimiters
  const segments = path.split(/\s*(?:->|-->|=>|>>)\s*/)

  if (segments.length >= 2) {
    return segments.map((seg) => {
      const trimmed = seg.trim()
      // Try to extract chain and token e.g. "Base USDC" or "USDC (Base)"
      const matchChainFirst = trimmed.match(/^(\w+)\s+(\w+)$/)
      const matchTokenParen = trimmed.match(/^(\w+)\s*\((\w+)\)$/)

      if (matchChainFirst) {
        return { chain: matchChainFirst[1], token: matchChainFirst[2] }
      }
      if (matchTokenParen) {
        return { chain: matchTokenParen[2], token: matchTokenParen[1] }
      }
      // Fallback: treat whole segment as a label
      return { chain: '', token: trimmed }
    })
  }

  // Fallback using intent data
  if (intent) {
    const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
    const fromChain = cap(intent.fromChain || intent.toChain || '')
    const toChain = cap(intent.toChain || intent.fromChain || '')
    const from = { chain: fromChain, token: intent.fromToken || '?' }
    const to = { chain: toChain, token: intent.toToken || '?' }
    return [from, to]
  }

  return [{ chain: '', token: path }]
}

function ChainDot({ chain }: { chain: string }) {
  const colors = getChainColor(chain)
  return (
    <span
      className={cn('inline-block w-2 h-2 rounded-full shrink-0', colors.dot)}
      title={chain}
    />
  )
}

function AnimatedArrow() {
  return (
    <span className="flex items-center gap-0.5 shrink-0 route-arrow">
      <span className="w-4 h-px bg-gradient-to-r from-[#D5D3CC] to-[#B8B5AD]" />
      <svg
        width="7"
        height="7"
        viewBox="0 0 8 8"
        fill="none"
        className="text-[#B8B5AD]"
      >
        <path
          d="M1 1L4 4L1 7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

function MiddleStep({ provider }: { provider: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F5EFE0] border border-[#DDD0B5] text-[10px] text-[#A17D2F] font-semibold shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-[#A17D2F] animate-pulse" />
      {provider}
    </span>
  )
}

export function RouteVisualizer({ route, intent }: RouteVisualizerProps) {
  const steps = parseRoutePath(route.path, intent)
  const isCrossChain =
    steps.length >= 2 &&
    steps[0].chain &&
    steps[steps.length - 1].chain &&
    steps[0].chain.toLowerCase() !== steps[steps.length - 1].chain.toLowerCase()

  return (
    <div className="flex items-center gap-1.5 flex-wrap py-1.5">
      {steps.map((step, idx) => (
        <span key={idx} className="contents">
          {/* Arrow + middleware before all steps except first */}
          {idx > 0 && (
            <>
              <AnimatedArrow />
              {/* Show provider in the middle of a 2-step route */}
              {steps.length === 2 && idx === 1 && (
                <>
                  <MiddleStep provider={route.provider} />
                  <AnimatedArrow />
                </>
              )}
            </>
          )}
          {/* Step node */}
          <span className={cn(
            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border shrink-0',
            step.chain ? getChainColor(step.chain).bg : 'bg-[#F2F0EB]',
            step.chain ? getChainColor(step.chain).border : 'border-[#E4E2DC]'
          )}>
            {step.chain && <ChainDot chain={step.chain} />}
            <span className="text-[11px] font-medium text-[#1C1B18]">
              {step.chain && (
                <span className={cn('mr-1 font-semibold', getChainColor(step.chain).text)}>
                  {step.chain}
                </span>
              )}
              {step.token}
            </span>
          </span>
        </span>
      ))}

      {/* Cross-chain badge */}
      {isCrossChain && (
        <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full bg-[#F2F0EB] text-[#6B6A63] border border-[#E4E2DC] font-semibold">
          cross-chain
        </span>
      )}
    </div>
  )
}

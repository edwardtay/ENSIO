'use client'

import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RouteVisualizer } from '@/components/route-visualizer'
import { RefreshCw } from 'lucide-react'
import type {
  RouteOption,
  ParsedIntent,
  TokenBalance,
  ENSConfig,
  ExecutionState,
} from '@/lib/types'

// --- Props ---

type ContextPanelProps = {
  balances: TokenBalance[]
  balancesLoading: boolean
  ensConfig: ENSConfig | null
  routes: RouteOption[]
  activeIntent: ParsedIntent | null
  selectedRouteId: string | null
  executionState: ExecutionState
  txHash: string | null
  txChainId?: number
  onSelectRoute: (route: RouteOption) => void
  onRefreshRoutes: () => void
}

// --- Helpers ---

function getChainBadgeClass(chain: string): string {
  const lower = chain.toLowerCase()
  if (lower.includes('base'))
    return 'bg-[#EBF2FE] text-[#3B6EB5] border-[#C4D6F0]'
  if (lower.includes('arbitrum'))
    return 'bg-[#F5EFE0] text-[#9C6A2F] border-[#DDD0B5]'
  if (lower.includes('optimism'))
    return 'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]'
  if (lower.includes('ethereum') || lower.includes('mainnet'))
    return 'bg-[#F2F0EB] text-[#6B6A63] border-[#E4E2DC]'
  return 'bg-[#F2F0EB] text-[#6B6A63] border-[#E4E2DC]'
}

function getRouteAccentClass(path: string): string {
  const lower = path.toLowerCase()
  if (lower.includes('base')) return 'border-l-[#3B82F6]'
  if (lower.includes('arbitrum')) return 'border-l-[#9C6A2F]'
  if (lower.includes('optimism')) return 'border-l-[#C53030]'
  if (lower.includes('unichain')) return 'border-l-[#A17D2F]'
  if (lower.includes('ethereum') || lower.includes('mainnet'))
    return 'border-l-[#6B6A63]'
  return 'border-l-[#E4E2DC]'
}

function getExplorerTxUrl(txHash: string, chainId?: number): string {
  switch (chainId) {
    case 42161:
      return `https://arbiscan.io/tx/${txHash}`
    case 8453:
      return `https://basescan.org/tx/${txHash}`
    case 10:
      return `https://optimistic.etherscan.io/tx/${txHash}`
    case 1301:
      return `https://sepolia.uniscan.xyz/tx/${txHash}`
    default:
      return `https://etherscan.io/tx/${txHash}`
  }
}

// --- Sub-components ---

function WalletBalances({
  balances,
  loading,
  ensConfig,
  compact,
}: {
  balances: TokenBalance[]
  loading: boolean
  ensConfig: ENSConfig | null
  compact?: boolean
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        <h3 className="text-[11px] font-semibold tracking-wider uppercase text-[#9C9B93] px-1">
          Wallet Balances
        </h3>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-[#F2F0EB] animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (balances.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-[11px] font-semibold tracking-wider uppercase text-[#9C9B93] px-1">
          Wallet Balances
        </h3>
        <p className="text-[13px] text-[#9C9B93] px-1">No balances found</p>
      </div>
    )
  }

  const preferredToken = ensConfig?.preferredToken?.toUpperCase()

  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-semibold tracking-wider uppercase text-[#9C9B93] px-1">
        Wallet Balances
      </h3>
      <div
        className={cn('space-y-1.5', compact && 'max-h-[140px] overflow-y-auto')}
      >
        {balances.map((b, i) => {
          const isPreferred =
            preferredToken && b.symbol?.toUpperCase() === preferredToken
          return (
            <div
              key={`${b.chain}-${b.symbol}-${i}`}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-[#E4E2DC]"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {!isPreferred && preferredToken && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-[#E4E2DC] shrink-0"
                    title="Not preferred token"
                  />
                )}
                {isPreferred && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-[#A17D2F] shrink-0"
                    title="Preferred token"
                  />
                )}
                <span className="text-[13px] font-semibold text-[#1C1B18]">
                  {b.symbol}
                </span>
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-[9px] font-semibold',
                    getChainBadgeClass(b.chain)
                  )}
                >
                  {b.chain}
                </Badge>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className="text-[13px] font-medium text-[#1C1B18] font-mono">
                  {b.balance}
                </span>
                {b.usdValue && (
                  <span className="text-[11px] text-[#9C9B93] font-mono">
                    ${b.usdValue}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ENSPreferences({ ensConfig }: { ensConfig: ENSConfig | null }) {
  if (!ensConfig) return null

  const hasPreference = ensConfig.preferredToken || ensConfig.preferredChain

  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-semibold tracking-wider uppercase text-[#9C9B93] px-1">
        Store of Value
      </h3>
      {hasPreference ? (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white border border-[#E4E2DC]">
          <span className="w-2 h-2 rounded-full bg-[#A17D2F] shrink-0" />
          <span className="text-[13px] text-[#1C1B18]">
            <span className="font-semibold">
              {ensConfig.preferredToken || 'USDC'}
            </span>
            {ensConfig.preferredChain && (
              <span className="text-[#9C9B93]">
                {' '}
                on{' '}
                {ensConfig.preferredChain.charAt(0).toUpperCase() +
                  ensConfig.preferredChain.slice(1)}
              </span>
            )}
          </span>
        </div>
      ) : (
        <p className="text-[13px] text-[#9C9B93] px-1">
          No preference set. Tell the agent what you want to hold.
        </p>
      )}
    </div>
  )
}

function RouteCards({
  routes,
  intent,
  selectedRouteId,
  executionState,
  onSelectRoute,
  onRefreshRoutes,
}: {
  routes: RouteOption[]
  intent: ParsedIntent | null
  selectedRouteId: string | null
  executionState: ExecutionState
  onSelectRoute: (route: RouteOption) => void
  onRefreshRoutes: () => void
}) {
  if (routes.length === 0) return null

  const isPreference = routes.length === 1 && routes[0].id === 'ens-preference'
  const isExecutionActive = executionState !== 'idle'

  if (isPreference) {
    return (
      <div className="space-y-2">
        <h3 className="text-[11px] font-semibold tracking-wider uppercase text-[#9C9B93] px-1">
          Preference
        </h3>
        <Button
          className="w-full py-3 rounded-xl bg-[#1C1B18] hover:bg-[#2D2C28] text-[#F8F7F4] font-medium cursor-pointer shadow-md shadow-[#1C1B18]/10 hover:shadow-lg transition-all disabled:opacity-40"
          onClick={() => onSelectRoute(routes[0])}
          disabled={isExecutionActive}
        >
          {executionState === 'pending' ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-[#A17D2F]/30 border-t-[#A17D2F] rounded-full animate-spin" />
              Signing...
            </span>
          ) : (
            'Set preference (free)'
          )}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[11px] font-semibold tracking-wider uppercase text-[#9C9B93]">
          {routes.length} Route{routes.length > 1 ? 's' : ''} Found
        </h3>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs text-[#9C9B93] hover:text-[#6B6A63] h-7 px-2 gap-1 cursor-pointer"
          onClick={onRefreshRoutes}
          disabled={isExecutionActive}
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </Button>
      </div>
      <div className="space-y-2">
        {routes.map((route) => {
          const isSelected = selectedRouteId === route.id
          const isDimmed = isExecutionActive && !isSelected
          return (
            <Card
              key={route.id}
              className={cn(
                'bg-white border border-[#E4E2DC] border-l-[3px] py-3 rounded-xl transition-all duration-200 route-card-enter',
                getRouteAccentClass(route.path),
                isSelected && 'ring-2 ring-[#A17D2F]/30 border-[#A17D2F]',
                isDimmed && 'opacity-40 pointer-events-none'
              )}
            >
              <CardContent className="px-4 py-0">
                <div className="flex flex-col gap-2">
                  <RouteVisualizer route={route} intent={intent ?? undefined} />

                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px] font-semibold',
                            route.provider.includes('Uniswap')
                              ? 'bg-[#F5EFE0] text-[#A17D2F] border-[#DDD0B5]'
                              : 'bg-[#F2F0EB] text-[#6B6A63] border-[#E4E2DC]'
                          )}
                        >
                          {route.provider}
                        </Badge>
                      </div>
                      <p className="text-sm text-[#6B6A63] truncate">
                        {route.path}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-[#9C9B93] font-medium">
                        <span>
                          Fee:{' '}
                          <span className="text-[#6B6A63]">{route.fee}</span>
                        </span>
                        <span className="text-[#E4E2DC]">|</span>
                        <span>
                          ETA:{' '}
                          <span className="text-[#6B6A63]">
                            {route.estimatedTime}
                          </span>
                        </span>
                      </div>
                    </div>
                    {route.id !== 'error' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn(
                          'shrink-0 border-[#E4E2DC] text-[#1C1B18] hover:bg-[#F2F0EB] hover:border-[#DDD0B5] cursor-pointer font-medium transition-colors',
                          isSelected &&
                            'bg-[#1C1B18] text-[#F8F7F4] hover:bg-[#2D2C28] hover:text-[#F8F7F4] border-[#1C1B18]'
                        )}
                        onClick={() => onSelectRoute(route)}
                        disabled={isExecutionActive}
                      >
                        {isSelected && executionState === 'approving'
                          ? 'Approving...'
                          : isSelected && executionState === 'pending'
                            ? 'Pending...'
                            : isSelected
                              ? 'Selected'
                              : 'Select'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function TransactionStatus({
  executionState,
  txHash,
  chainId,
}: {
  executionState: ExecutionState
  txHash: string | null
  chainId?: number
}) {
  if (executionState === 'idle' && !txHash) return null

  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-semibold tracking-wider uppercase text-[#9C9B93] px-1">
        Transaction
      </h3>

      {executionState === 'confirmed' && txHash ? (
        <div className="px-3 py-3 rounded-lg bg-white border border-[#C4D6A0]">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-[13px] font-semibold text-[#1C1B18]">
              Confirmed
            </span>
          </div>
          <a
            href={getExplorerTxUrl(txHash, chainId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-[#A17D2F] hover:text-[#8A6A25] font-medium underline underline-offset-2 decoration-[#DDD0B5] hover:decoration-[#A17D2F] transition-colors font-mono"
          >
            {txHash.slice(0, 10)}...{txHash.slice(-8)}
          </a>
        </div>
      ) : executionState === 'error' ? (
        <div className="px-3 py-3 rounded-lg bg-white border border-red-200">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-[13px] font-medium text-red-700">
              Failed
            </span>
          </div>
        </div>
      ) : executionState === 'approving' || executionState === 'pending' ? (
        <div className="px-3 py-3 rounded-lg bg-white border border-[#E4E2DC]">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-[#A17D2F]/30 border-t-[#A17D2F] rounded-full animate-spin" />
            <span className="text-[13px] font-medium text-[#1C1B18]">
              {executionState === 'approving'
                ? 'Waiting for approval...'
                : 'Transaction pending...'}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// --- Main ---

export function ContextPanel({
  balances,
  balancesLoading,
  ensConfig,
  routes,
  activeIntent,
  selectedRouteId,
  executionState,
  txHash,
  txChainId,
  onSelectRoute,
  onRefreshRoutes,
}: ContextPanelProps) {
  const hasRoutes = routes.length > 0
  const compactBalances = hasRoutes

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5 overflow-y-auto h-full">
      <WalletBalances
        balances={balances}
        loading={balancesLoading}
        ensConfig={ensConfig}
        compact={compactBalances}
      />

      <ENSPreferences ensConfig={ensConfig} />

      <RouteCards
        routes={routes}
        intent={activeIntent}
        selectedRouteId={selectedRouteId}
        executionState={executionState}
        onSelectRoute={onSelectRoute}
        onRefreshRoutes={onRefreshRoutes}
      />

      <TransactionStatus
        executionState={executionState}
        txHash={txHash}
        chainId={txChainId}
      />

      {!balancesLoading && balances.length === 0 && !hasRoutes && (
        <div className="flex flex-col items-center justify-center flex-1 py-12 text-center">
          <div className="w-10 h-10 rounded-full bg-[#F2F0EB] flex items-center justify-center mb-3">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              className="text-[#9C9B93]"
            >
              <path
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M9 12h6M12 9v6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <p className="text-[13px] text-[#9C9B93]">
            Connect your wallet to see balances
          </p>
        </div>
      )}
    </div>
  )
}

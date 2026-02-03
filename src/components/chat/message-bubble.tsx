'use client'

import { cn } from '@/lib/utils'
import type { Message, RouteOption, ParsedIntent } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RouteVisualizer } from '@/components/route-visualizer'
import { RefreshCw } from 'lucide-react'

/** Returns a block explorer URL for a given tx hash and chain ID */
function getExplorerTxUrl(txHash: string, chainId?: number): string {
  switch (chainId) {
    case 42161: return `https://arbiscan.io/tx/${txHash}`
    case 8453: return `https://basescan.org/tx/${txHash}`
    case 10: return `https://optimistic.etherscan.io/tx/${txHash}`
    case 1301: return `https://sepolia.uniscan.xyz/tx/${txHash}`
    default: return `https://etherscan.io/tx/${txHash}`
  }
}

/** Returns a chain-accent left border class for route cards */
function getRouteAccentClass(path: string): string {
  const lower = path.toLowerCase()
  if (lower.includes('base')) return 'border-l-[#3B82F6]'
  if (lower.includes('arbitrum')) return 'border-l-[#9C6A2F]'
  if (lower.includes('optimism')) return 'border-l-[#C53030]'
  if (lower.includes('unichain')) return 'border-l-[#A17D2F]'
  if (lower.includes('ethereum') || lower.includes('mainnet')) return 'border-l-[#6B6A63]'
  return 'border-l-[#E4E2DC]'
}

type MessageBubbleProps = {
  message: Message
  onSelectRoute?: (route: RouteOption, intent?: ParsedIntent, ensName?: string) => void
  onRefreshRoutes?: () => void
}

export function MessageBubble({ message, onSelectRoute, onRefreshRoutes }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div
      className={cn(
        'flex w-full mb-5 message-enter',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[85%] md:max-w-[72%] flex flex-col gap-2.5',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        {/* Message bubble */}
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
            isUser
              ? 'bg-[#1C1B18] text-[#F8F7F4] rounded-br-sm shadow-md shadow-[#1C1B18]/10'
              : 'bg-white text-[#1C1B18] rounded-bl-sm border border-[#E4E2DC]'
          )}
        >
          {message.content}
        </div>

        {/* ENS preference action — rendered as a simple confirm button */}
        {message.routes && message.routes.length === 1 && message.routes[0].id === 'ens-preference' && (
          <Button
            className="w-full py-3 rounded-2xl bg-[#1C1B18] hover:bg-[#2D2C28] text-[#F8F7F4] font-medium cursor-pointer shadow-md shadow-[#1C1B18]/10 hover:shadow-lg transition-all"
            onClick={() => onSelectRoute?.(message.routes![0], message.intent, message.ensName)}
          >
            Set preference (free)
          </Button>
        )}

        {/* Route option cards */}
        {message.routes && message.routes.length > 0 && !(message.routes.length === 1 && message.routes[0].id === 'ens-preference') && (
          <div className="flex flex-col gap-2 w-full">
            {(message.routes.length > 1 || onRefreshRoutes) && (
              <div className="flex items-center justify-between">
                {message.routes.length > 1 && (
                  <span className="text-xs text-[#9C9B93] font-medium">
                    {message.routes.length} routes found
                  </span>
                )}
                {onRefreshRoutes && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-[#9C9B93] hover:text-[#6B6A63] h-7 px-2 gap-1 cursor-pointer ml-auto"
                    onClick={onRefreshRoutes}
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh
                  </Button>
                )}
              </div>
            )}
            {message.routes.map((route) => (
              <Card
                key={route.id}
                className={cn(
                  'bg-white border border-[#E4E2DC] border-l-[3px] py-3 rounded-xl transition-all duration-200 hover:shadow-md route-card-enter',
                  getRouteAccentClass(route.path)
                )}
              >
                <CardContent className="px-4 py-0">
                  <div className="flex flex-col gap-2">
                    {/* Route visualization */}
                    <RouteVisualizer route={route} intent={message.intent} />

                    {/* Provider + path + controls */}
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
                          <span>Fee: <span className="text-[#6B6A63]">{route.fee}</span></span>
                          <span className="text-[#E4E2DC]">|</span>
                          <span>ETA: <span className="text-[#6B6A63]">{route.estimatedTime}</span></span>
                        </div>
                      </div>
                      {route.id !== 'error' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 border-[#E4E2DC] text-[#1C1B18] hover:bg-[#F2F0EB] hover:border-[#DDD0B5] cursor-pointer sm:w-auto w-full mt-2 sm:mt-0 font-medium transition-colors"
                          onClick={() => onSelectRoute?.(route, message.intent, message.ensName)}
                        >
                          Select
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Transaction hash link */}
        {message.txHash && (
          <a
            href={getExplorerTxUrl(message.txHash, message.chainId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[#A17D2F] hover:text-[#8A6A25] font-medium underline underline-offset-2 decoration-[#DDD0B5] hover:decoration-[#A17D2F] transition-colors"
          >
            View transaction: <span className="font-mono text-[11px]">{message.txHash.slice(0, 10)}...{message.txHash.slice(-8)}</span>
          </a>
        )}

        {/* Timestamp */}
        <span className="text-[10px] text-[#9C9B93] font-medium px-1">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  )
}

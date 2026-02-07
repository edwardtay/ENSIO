import { getAddress } from 'viem'
import type { RouteOption } from '@/lib/types'
import { CHAIN_MAP, getTokenAddress, getTokenDecimals } from './tokens'
import { getCached, setCache } from './route-cache'

// LI.FI API base URL
const LIFI_API = 'https://li.quest/v1'

// Exchanges to exclude (known problematic DEXes)
const DENY_EXCHANGES = ['nordstern']

// Note: Atomic vault deposits via contract calls are disabled due to MEV vulnerability.
// For now, we send USDC directly to recipient. Vault deposits can be done manually.
// See: https://basescan.org/tx/0x38ff70f552f6d1fa303c5f548ce40042dcdecaa43eef815df6770e905a0915d8
// (MEV bot successfully deposited using our YieldRouter - proving the concept works)

// Deployed YieldRouter address on Base Mainnet (v7 - checks balance first, then allowance)
export const YIELD_ROUTER_ADDRESS: `0x${string}` = '0x7426467422F01289e0a8eb24e5982F51a87FBc3c'

// Base chain ID for YieldRoute (always deposits to Base)
const BASE_CHAIN_ID = CHAIN_MAP.base

export interface YieldRouteParams {
  fromAddress: string
  fromChain: string
  fromToken: string
  amount: string
  recipient: string // ENS-resolved address
  vault: string // ERC-4626 vault address from ENS
  slippage?: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface YieldRouteQuote {
  route: RouteOption
  quote: any // LI.FI quote response
}

function extractErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error
  ) {
    const resp = (error as { response?: { data?: { message?: string } } })
      .response
    if (resp?.data?.message) {
      return resp.data.message
    }
  }
  return 'Failed to find yield route'
}

export async function getYieldRouteQuote(
  params: YieldRouteParams
): Promise<YieldRouteQuote | { error: string }> {
  const fromChainId = CHAIN_MAP[params.fromChain] || CHAIN_MAP.ethereum
  const toChainId = BASE_CHAIN_ID // Always Base
  const fromTokenAddr = getTokenAddress(params.fromToken, fromChainId)
  const toTokenAddr = getTokenAddress('USDC', toChainId) // Always USDC on Base

  if (!fromTokenAddr) {
    return { error: `Source token not supported: ${params.fromToken}` }
  }

  if (!toTokenAddr) {
    return { error: 'USDC not supported on Base' }
  }

  if (!params.vault || params.vault === '0x0000000000000000000000000000000000000000') {
    return { error: 'No vault configured for recipient' }
  }

  // Normalize recipient address to checksummed format
  let normalizedRecipient: `0x${string}`
  try {
    normalizedRecipient = getAddress(params.recipient)
  } catch {
    return { error: `Invalid recipient address: ${params.recipient}` }
  }

  const decimals = getTokenDecimals(params.fromToken)
  const amountWei = BigInt(
    Math.floor(parseFloat(params.amount) * 10 ** decimals)
  ).toString()

  const cacheKey = `yield:${fromChainId}:${params.recipient}:${params.vault}:${amountWei}`
  const cached = getCached<YieldRouteQuote>(cacheKey)
  if (cached) return cached

  try {
    // Simple direct transfer - send USDC to recipient
    // Vault deposit can be done manually by recipient or via separate tx
    const quoteUrl = new URL(`${LIFI_API}/quote`)
    quoteUrl.searchParams.set('fromAddress', params.fromAddress)
    quoteUrl.searchParams.set('fromChain', fromChainId.toString())
    quoteUrl.searchParams.set('fromToken', fromTokenAddr)
    quoteUrl.searchParams.set('fromAmount', amountWei)
    quoteUrl.searchParams.set('toChain', toChainId.toString())
    quoteUrl.searchParams.set('toToken', toTokenAddr)
    quoteUrl.searchParams.set('toAddress', normalizedRecipient)
    quoteUrl.searchParams.set('slippage', (params.slippage || 0.005).toString())
    quoteUrl.searchParams.set('denyExchanges', DENY_EXCHANGES.join(','))
    quoteUrl.searchParams.set('integrator', 'flowfi')

    const quoteRes = await fetch(quoteUrl.toString())
    const quote = await quoteRes.json()

    if (quote.message) {
      return { error: quote.message }
    }

    const steps = quote.includedSteps || []
    const bridgePath =
      steps.length > 0
        ? steps.map((s: { toolDetails?: { name?: string }; type?: string }) => s.toolDetails?.name || s.type).join(' -> ')
        : `${params.fromToken} -> USDC`

    const estimatedGas =
      quote.estimate?.gasCosts?.reduce(
        (sum: number, g: { amountUSD?: string }) => sum + Number(g.amountUSD || 0),
        0
      ) ?? 0

    const estimatedDuration = quote.estimate?.executionDuration
      ? `${Math.ceil(quote.estimate.executionDuration / 60)} min`
      : '~3 min'

    const result: YieldRouteQuote = {
      route: {
        id: 'yield-route-0',
        path: `YieldRoute: ${bridgePath} -> Recipient`,
        fee: `$${estimatedGas.toFixed(2)}`,
        estimatedTime: estimatedDuration,
        provider: 'LI.FI',
        routeType: 'standard',
      },
      quote,
    }

    setCache(cacheKey, result)
    return result
  } catch (error: unknown) {
    console.error('YieldRoute quote error:', error)
    return { error: extractErrorDetail(error) }
  }
}

/**
 * Check if a recipient has yield routing configured
 */
export function isYieldRouteEnabled(vault: string | undefined): boolean {
  return (
    !!vault &&
    vault !== '0x0000000000000000000000000000000000000000' &&
    vault.startsWith('0x') &&
    vault.length === 42
  )
}

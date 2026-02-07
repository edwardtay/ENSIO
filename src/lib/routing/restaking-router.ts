/**
 * Restaking Router
 *
 * Routes payments to Renzo for EigenLayer restaking via RestakingRouter contract.
 * Uses LI.FI Contract Calls to atomically bridge any token → WETH → Renzo → ezETH.
 *
 * Flow:
 * 1. Payer signs single tx
 * 2. LI.FI bridges any token to WETH on Base
 * 3. LI.FI calls RestakingRouter.depositToRestaking()
 * 4. RestakingRouter deposits to Renzo and forwards ezETH to recipient
 */

import { getContractCallsQuote, getQuote, type ContractCallsQuoteRequest, type QuoteRequest } from '@lifi/sdk'
import { encodeFunctionData, getAddress } from 'viem'
import type { RouteOption } from '@/lib/types'
import { CHAIN_MAP, getTokenAddress, getTokenDecimals } from './tokens'
import { getCached, setCache } from './route-cache'
import { STRATEGIES } from '@/lib/strategies'

// RestakingRouter contract address on Base mainnet
export const RESTAKING_ROUTER_ADDRESS: `0x${string}` = '0x31549dB00B180d528f77083b130C0A045D0CF117'

// RestakingRouter ABI
const RESTAKING_ROUTER_ABI = [
  {
    name: 'depositToRestaking',
    type: 'function',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'ezETHAmount', type: 'uint256' }],
  },
] as const

export interface RestakingRouteParams {
  fromAddress: string
  fromChain: string
  fromToken: string
  amount: string
  recipient: string
  slippage?: number
}

export interface RestakingRouteQuote {
  route: RouteOption
  quote: Awaited<ReturnType<typeof getContractCallsQuote>>
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
  return 'Failed to find restaking route'
}

/**
 * Check if RestakingRouter is deployed
 */
export function isRestakingRouterDeployed(): boolean {
  return RESTAKING_ROUTER_ADDRESS !== '0x0000000000000000000000000000000000000000'
}

/**
 * Get a quote for atomic restaking via RestakingRouter
 *
 * Flow: Any token on any chain → WETH on Base → RestakingRouter → ezETH to recipient
 */
export async function getRestakingRouteQuote(
  params: RestakingRouteParams
): Promise<RestakingRouteQuote | { error: string }> {
  // Normalize addresses to checksummed format (LI.FI requires this)
  let fromAddress: `0x${string}`
  let recipient: `0x${string}`
  try {
    fromAddress = getAddress(params.fromAddress)
    recipient = getAddress(params.recipient)
  } catch {
    return { error: 'Invalid address format' }
  }

  // If RestakingRouter not deployed, fall back to simple WETH transfer
  if (!isRestakingRouterDeployed()) {
    return getSimpleRestakingQuote({ ...params, fromAddress, recipient })
  }

  const strategy = STRATEGIES.restaking
  const fromChainId = CHAIN_MAP[params.fromChain] || CHAIN_MAP.ethereum
  const toChainId = strategy.destChainId // Base

  // Source token
  const fromTokenAddr = getTokenAddress(params.fromToken, fromChainId)
  if (!fromTokenAddr) {
    return { error: `Source token not supported: ${params.fromToken}` }
  }

  // Destination is WETH on Base (RestakingRouter accepts WETH)
  const toTokenAddr = strategy.destTokenAddress

  const decimals = getTokenDecimals(params.fromToken)
  const amountWei = BigInt(
    Math.floor(parseFloat(params.amount) * 10 ** decimals)
  ).toString()

  const cacheKey = `restaking:${fromChainId}:${params.fromToken}:${recipient}:${amountWei}`
  const cached = getCached<RestakingRouteQuote>(cacheKey)
  if (cached) return cached

  try {
    // Build the destination call data for RestakingRouter.depositToRestaking
    const callData = encodeFunctionData({
      abi: RESTAKING_ROUTER_ABI,
      functionName: 'depositToRestaking',
      args: [
        recipient,
        BigInt(amountWei),
      ],
    })

    // Get quote with contract call
    const quoteRequest: ContractCallsQuoteRequest = {
      fromAddress: fromAddress,
      fromChain: fromChainId,
      fromToken: fromTokenAddr,
      toChain: toChainId,
      toToken: toTokenAddr, // WETH on Base
      toAmount: amountWei,
      toFallbackAddress: recipient,
      contractCalls: [
        {
          fromAmount: amountWei,
          fromTokenAddress: toTokenAddr,
          toContractAddress: RESTAKING_ROUTER_ADDRESS,
          toContractCallData: callData,
          toContractGasLimit: '350000', // Higher gas for Renzo deposit
        },
      ],
      slippage: params.slippage || 0.01,
    }

    const quote = await getContractCallsQuote(quoteRequest)

    const steps = quote.includedSteps || []
    const bridgePath =
      steps.length > 0
        ? steps.map((s) => s.toolDetails?.name || s.type).join(' → ')
        : `${params.fromToken} → WETH`

    const estimatedGas =
      quote.estimate?.gasCosts?.reduce(
        (sum, g) => sum + Number(g.amountUSD || 0),
        0
      ) ?? 0

    const estimatedDuration = quote.estimate?.executionDuration
      ? `${Math.ceil(quote.estimate.executionDuration / 60)} min`
      : '~5 min'

    const result: RestakingRouteQuote = {
      route: {
        id: 'restaking-route-0',
        path: `${bridgePath} → Renzo → ezETH`,
        fee: `$${estimatedGas.toFixed(2)}`,
        estimatedTime: estimatedDuration,
        provider: 'LI.FI + Renzo',
        routeType: 'contract-call',
      },
      quote,
    }

    setCache(cacheKey, result)
    return result
  } catch (error: unknown) {
    console.error('Restaking route quote error:', error)
    // Fall back to simple quote if contract calls fail
    return getSimpleRestakingQuote(params)
  }
}

/**
 * Fallback: Simple quote that just bridges to WETH (no atomic Renzo deposit)
 * Used when RestakingRouter is not deployed or contract calls fail
 */
async function getSimpleRestakingQuote(
  params: RestakingRouteParams
): Promise<RestakingRouteQuote | { error: string }> {
  // Normalize addresses to checksummed format (LI.FI requires this)
  let fromAddress: `0x${string}`
  let recipient: `0x${string}`
  try {
    fromAddress = getAddress(params.fromAddress)
    recipient = getAddress(params.recipient)
  } catch {
    return { error: 'Invalid address format' }
  }

  const strategy = STRATEGIES.restaking
  const fromChainId = CHAIN_MAP[params.fromChain] || CHAIN_MAP.ethereum
  const toChainId = strategy.destChainId

  const fromTokenAddr = getTokenAddress(params.fromToken, fromChainId)
  if (!fromTokenAddr) {
    return { error: `Source token not supported: ${params.fromToken}` }
  }

  const toTokenAddr = strategy.destTokenAddress
  const decimals = getTokenDecimals(params.fromToken)
  const amountWei = BigInt(
    Math.floor(parseFloat(params.amount) * 10 ** decimals)
  ).toString()

  try {
    const quoteRequest: QuoteRequest = {
      fromAddress: fromAddress,
      fromChain: fromChainId,
      fromToken: fromTokenAddr,
      fromAmount: amountWei,
      toChain: toChainId,
      toToken: toTokenAddr,
      toAddress: recipient,
      slippage: params.slippage || 0.01,
    }

    const quote = await getQuote(quoteRequest)

    const steps = quote.includedSteps || []
    const bridgePath =
      steps.length > 0
        ? steps.map((s) => s.toolDetails?.name || s.type).join(' → ')
        : `${params.fromToken} → WETH`

    const estimatedGas =
      quote.estimate?.gasCosts?.reduce(
        (sum, g) => sum + Number(g.amountUSD || 0),
        0
      ) ?? 0

    const estimatedDuration = quote.estimate?.executionDuration
      ? `${Math.ceil(quote.estimate.executionDuration / 60)} min`
      : '~3 min'

    return {
      route: {
        id: 'restaking-route-0',
        path: `${bridgePath} → Ready for Renzo`,
        fee: `$${estimatedGas.toFixed(2)}`,
        estimatedTime: estimatedDuration,
        provider: 'LI.FI',
        routeType: 'standard',
      },
      quote: quote as any, // Type compatibility
    }
  } catch (error: unknown) {
    console.error('Simple restaking quote error:', error)
    return { error: extractErrorDetail(error) }
  }
}

/**
 * Check if restaking is enabled for a strategy
 */
export function isRestakingStrategy(strategy: string | undefined): boolean {
  return strategy?.toLowerCase() === 'restaking'
}

import { createConfig, getRoutes, getQuote, getContractCallsQuote } from '@lifi/sdk'
import type { RouteOption, RouteType } from '@/lib/types'
import {
  CHAIN_MAP,
  getTokenAddress,
  getTokenDecimals,
  getVaultTokenAddress,
} from './tokens'
import { getCached, setCache } from './route-cache'

createConfig({ integrator: 'payagent' })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRouteOption(
  id: string,
  path: string,
  fee: string,
  estimatedTime: string,
  provider: string,
  routeType: RouteType
): RouteOption {
  return { id, path, fee, estimatedTime, provider, routeType }
}

function errorRoute(detail: string, routeType: RouteType = 'standard'): RouteOption[] {
  return [
    buildRouteOption('error', detail, 'N/A', 'N/A', 'LI.FI', routeType),
  ]
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
  return 'Failed to find routes'
}

// ---------------------------------------------------------------------------
// 1. Standard routes (backward-compatible)
// ---------------------------------------------------------------------------

export async function findRoutes(params: {
  fromAddress: string
  fromChain: string
  toChain: string
  fromToken: string
  toToken: string
  amount: string
  slippage?: number
}): Promise<RouteOption[]> {
  const fromChainId = CHAIN_MAP[params.fromChain] || CHAIN_MAP.ethereum
  const toChainId = CHAIN_MAP[params.toChain] || fromChainId
  const fromTokenAddr = getTokenAddress(params.fromToken, fromChainId)
  const toTokenAddr = getTokenAddress(params.toToken, toChainId)

  if (!fromTokenAddr || !toTokenAddr) {
    return errorRoute(
      `Token not supported: ${params.fromToken} or ${params.toToken}`
    )
  }

  const decimals = getTokenDecimals(params.fromToken)
  const amountWei = BigInt(
    Math.floor(parseFloat(params.amount) * 10 ** decimals)
  ).toString()

  const cacheKey = `std:${fromChainId}:${toChainId}:${fromTokenAddr}:${toTokenAddr}:${amountWei}`
  const cached = getCached<RouteOption[]>(cacheKey)
  if (cached) return cached

  try {
    const result = await getRoutes({
      fromAddress: params.fromAddress,
      fromChainId,
      toChainId,
      fromTokenAddress: fromTokenAddr,
      toTokenAddress: toTokenAddr,
      fromAmount: amountWei,
      options: {
        slippage: params.slippage || 0.005,
      },
    })

    const routes: RouteOption[] = result.routes.slice(0, 3).map((route, i) =>
      buildRouteOption(
        `lifi-route-${i}`,
        route.steps.map((s) => s.toolDetails.name).join(' -> '),
        `$${Number(route.gasCostUSD || '0').toFixed(2)}`,
        `${Math.ceil(
          route.steps.reduce(
            (a, s) => a + (s.estimate?.executionDuration || 0),
            0
          ) / 60
        )} min`,
        'LI.FI',
        'standard'
      )
    )
    setCache(cacheKey, routes)
    return routes
  } catch (error: unknown) {
    console.error('LI.FI route error:', error)
    return errorRoute(extractErrorDetail(error))
  }
}

// ---------------------------------------------------------------------------
// 2. Composer routes — vault deposits via standard quote with vault toToken
// ---------------------------------------------------------------------------

export async function findComposerRoutes(params: {
  fromAddress: string
  fromChain: string
  toChain: string
  fromToken: string
  amount: string
  vaultProtocol: string // e.g. "aave" | "morpho"
  slippage?: number
}): Promise<RouteOption[]> {
  const fromChainId = CHAIN_MAP[params.fromChain] || CHAIN_MAP.ethereum
  const toChainId = CHAIN_MAP[params.toChain] || fromChainId
  const fromTokenAddr = getTokenAddress(params.fromToken, fromChainId)

  // Resolve vault token address on the destination chain
  const vaultTokenAddr = getVaultTokenAddress(
    params.vaultProtocol,
    params.fromToken,
    toChainId
  )

  if (!fromTokenAddr) {
    return errorRoute(
      `Source token not supported: ${params.fromToken}`,
      'composer'
    )
  }

  if (!vaultTokenAddr) {
    return errorRoute(
      `No ${params.vaultProtocol} vault found for ${params.fromToken} on ${params.toChain}`,
      'composer'
    )
  }

  const decimals = getTokenDecimals(params.fromToken)
  const amountWei = BigInt(
    Math.floor(parseFloat(params.amount) * 10 ** decimals)
  ).toString()

  const cacheKey = `composer:${fromChainId}:${toChainId}:${fromTokenAddr}:${vaultTokenAddr}:${amountWei}`
  const cached = getCached<RouteOption[]>(cacheKey)
  if (cached) return cached

  try {
    // LI.FI Composer: use the standard /v1/quote endpoint with the vault token
    // as `toToken`. The backend detects the vault and builds a Composer workflow.
    const quote = await getQuote({
      fromChain: fromChainId,
      fromToken: fromTokenAddr,
      fromAddress: params.fromAddress,
      fromAmount: amountWei,
      toChain: toChainId,
      toToken: vaultTokenAddr,
      toAddress: params.fromAddress,
      slippage: params.slippage || 0.005,
    })

    const steps = quote.includedSteps || []
    const path =
      steps.length > 0
        ? steps.map((s) => s.toolDetails?.name || s.type).join(' -> ')
        : `${params.fromToken} -> ${params.vaultProtocol} vault`

    const estimatedGas = quote.estimate?.gasCosts?.reduce(
      (sum, g) => sum + Number(g.amountUSD || 0),
      0
    ) ?? 0

    const estimatedDuration = quote.estimate?.executionDuration
      ? `${Math.ceil(quote.estimate.executionDuration / 60)} min`
      : '~2 min'

    const routes: RouteOption[] = [
      buildRouteOption(
        'lifi-composer-0',
        `Composer: ${path}`,
        `$${estimatedGas.toFixed(2)}`,
        estimatedDuration,
        'LI.FI Composer',
        'composer'
      ),
    ]
    setCache(cacheKey, routes)
    return routes
  } catch (error: unknown) {
    console.error('LI.FI Composer route error:', error)
    return errorRoute(extractErrorDetail(error), 'composer')
  }
}

// ---------------------------------------------------------------------------
// 3. Contract Calls routes — post-bridge arbitrary contract execution
// ---------------------------------------------------------------------------

export type ContractCallInput = {
  fromAmount: string
  fromTokenAddress: string
  toContractAddress: string
  toContractCallData: string
  toContractGasLimit: string
}

export async function findContractCallRoutes(params: {
  fromAddress: string
  fromChain: string
  toChain: string
  fromToken: string
  toToken: string
  toAmount: string
  contractCalls: ContractCallInput[]
  slippage?: number
}): Promise<RouteOption[]> {
  const fromChainId = CHAIN_MAP[params.fromChain] || CHAIN_MAP.ethereum
  const toChainId = CHAIN_MAP[params.toChain] || fromChainId
  const fromTokenAddr = getTokenAddress(params.fromToken, fromChainId)
  const toTokenAddr = getTokenAddress(params.toToken, toChainId)

  if (!fromTokenAddr || !toTokenAddr) {
    return errorRoute(
      `Token not supported: ${params.fromToken} or ${params.toToken}`,
      'contract-call'
    )
  }

  if (params.contractCalls.length === 0) {
    return errorRoute('No contract calls provided', 'contract-call')
  }

  const cacheKey = `cc:${fromChainId}:${toChainId}:${fromTokenAddr}:${toTokenAddr}:${params.toAmount}:${params.contractCalls[0].toContractAddress}`
  const cached = getCached<RouteOption[]>(cacheKey)
  if (cached) return cached

  try {
    const quote = await getContractCallsQuote({
      fromAddress: params.fromAddress,
      fromChain: fromChainId,
      fromToken: fromTokenAddr,
      toChain: toChainId,
      toToken: toTokenAddr,
      toAmount: params.toAmount,
      contractCalls: params.contractCalls,
      slippage: params.slippage || 0.005,
    } as Parameters<typeof getContractCallsQuote>[0])

    const steps = quote.includedSteps || []
    const path =
      steps.length > 0
        ? steps.map((s) => s.toolDetails?.name || s.type).join(' -> ')
        : `${params.fromToken} -> contract call`

    const estimatedGas = quote.estimate?.gasCosts?.reduce(
      (sum, g) => sum + Number(g.amountUSD || 0),
      0
    ) ?? 0

    const estimatedDuration = quote.estimate?.executionDuration
      ? `${Math.ceil(quote.estimate.executionDuration / 60)} min`
      : '~3 min'

    const routes: RouteOption[] = [
      buildRouteOption(
        'lifi-contract-call-0',
        `Contract Call: ${path}`,
        `$${estimatedGas.toFixed(2)}`,
        estimatedDuration,
        'LI.FI Contract Calls',
        'contract-call'
      ),
    ]
    setCache(cacheKey, routes)
    return routes
  } catch (error: unknown) {
    console.error('LI.FI contract call route error:', error)
    return errorRoute(extractErrorDetail(error), 'contract-call')
  }
}

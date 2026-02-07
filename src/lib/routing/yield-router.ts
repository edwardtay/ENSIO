import { getAddress } from 'viem'
import type { RouteOption } from '@/lib/types'
import { CHAIN_MAP, getTokenAddress, getTokenDecimals } from './tokens'
import { getCached, setCache } from './route-cache'

// LI.FI API base URL
const LIFI_API = 'https://li.quest/v1'

// Exchanges to exclude (known problematic DEXes)
const DENY_EXCHANGES = ['nordstern']

// MEV-Protected Vault Router - uses slippage protection + designed for private RPC
// Supports: depositWithSlippage, commitDeposit/revealAndDeposit, lifiCallback
export const MEV_PROTECTED_ROUTER: `0x${string}` = '0x0B880127FFb09727468159f3883c76Fd1B1c59A2'

// Legacy router (deprecated)
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
    // LI.FI vault zap: use vault address as toToken for atomic deposit
    // This triggers LI.FI Composer to swap + deposit in one tx
    const quoteUrl = new URL(`${LIFI_API}/quote`)
    quoteUrl.searchParams.set('fromAddress', params.fromAddress)
    quoteUrl.searchParams.set('fromChain', fromChainId.toString())
    quoteUrl.searchParams.set('fromToken', fromTokenAddr)
    quoteUrl.searchParams.set('fromAmount', amountWei)
    quoteUrl.searchParams.set('toChain', toChainId.toString())
    quoteUrl.searchParams.set('toToken', params.vault) // Vault address = auto deposit
    quoteUrl.searchParams.set('toAddress', normalizedRecipient) // Shares go to recipient
    quoteUrl.searchParams.set('slippage', (params.slippage || 0.005).toString())
    quoteUrl.searchParams.set('denyExchanges', DENY_EXCHANGES.join(','))
    quoteUrl.searchParams.set('integrator', 'ensio')

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

/**
 * Get MEV-protected yield route using LI.FI Contract Calls
 * Routes: Any token → USDC on Base → MEVProtectedVaultRouter.lifiCallback → Vault
 */
export async function getMEVProtectedYieldRouteQuote(
  params: YieldRouteParams
): Promise<YieldRouteQuote | { error: string }> {
  const fromChainId = CHAIN_MAP[params.fromChain] || CHAIN_MAP.ethereum
  const toChainId = BASE_CHAIN_ID
  const fromTokenAddr = getTokenAddress(params.fromToken, fromChainId)
  const usdcAddr = getTokenAddress('USDC', toChainId)

  if (!fromTokenAddr) {
    return { error: `Source token not supported: ${params.fromToken}` }
  }

  if (!params.vault) {
    return { error: 'No vault configured for recipient' }
  }

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

  // Calculate minShares with 0.5% slippage (shares ≈ assets for USDC vaults)
  const slippageBps = Math.floor((params.slippage || 0.005) * 10000)
  const expectedShares = BigInt(amountWei) * BigInt(10 ** 12) // USDC 6 decimals → 18 decimals
  const minShares = expectedShares - (expectedShares * BigInt(slippageBps)) / BigInt(10000)

  try {
    // LI.FI Contract Calls API
    // 1. Bridge any token → USDC on Base
    // 2. Send USDC to MEVProtectedVaultRouter
    // 3. Call lifiCallback(vault, recipient, minShares)
    const contractCallsUrl = `${LIFI_API}/quote/contractCalls`

    const requestBody = {
      fromChain: fromChainId,
      fromToken: fromTokenAddr,
      fromAddress: params.fromAddress,
      fromAmount: amountWei,
      toChain: toChainId,
      toToken: usdcAddr,
      toAmount: amountWei, // Will be adjusted by LI.FI
      contractCalls: [
        {
          fromAmount: '0', // Use full received amount
          fromTokenAddress: usdcAddr,
          toContractAddress: MEV_PROTECTED_ROUTER,
          toContractCallData: encodeLifiCallback(
            params.vault as `0x${string}`,
            normalizedRecipient,
            minShares
          ),
          toContractGasLimit: '300000',
        },
      ],
      slippage: params.slippage || 0.005,
      denyExchanges: DENY_EXCHANGES,
      integrator: 'ensio',
    }

    const res = await fetch(contractCallsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    const quote = await res.json()

    if (quote.message || quote.error) {
      return { error: quote.message || quote.error }
    }

    const estimatedGas =
      quote.estimate?.gasCosts?.reduce(
        (sum: number, g: { amountUSD?: string }) => sum + Number(g.amountUSD || 0),
        0
      ) ?? 0

    const result: YieldRouteQuote = {
      route: {
        id: 'mev-protected-yield-0',
        path: `${params.fromToken} → USDC → MEV-Protected Vault Deposit`,
        fee: `$${estimatedGas.toFixed(2)}`,
        estimatedTime: '~5 min',
        provider: 'LI.FI + MEVProtectedVaultRouter',
        routeType: 'contract-call',
      },
      quote,
    }

    return result
  } catch (error: unknown) {
    console.error('MEV-protected yield route error:', error)
    return { error: extractErrorDetail(error) }
  }
}

/**
 * Encode lifiCallback calldata
 */
function encodeLifiCallback(
  vault: `0x${string}`,
  recipient: `0x${string}`,
  minShares: bigint
): string {
  // lifiCallback(address vault, address recipient, uint256 minShares)
  // Function selector: keccak256("lifiCallback(address,address,uint256)")[:4] = 0x5cd7911a
  const selector = '0x5cd7911a'

  // ABI encode parameters
  const vaultPadded = vault.slice(2).toLowerCase().padStart(64, '0')
  const recipientPadded = recipient.slice(2).toLowerCase().padStart(64, '0')
  const minSharesHex = minShares.toString(16).padStart(64, '0')

  return `${selector}${vaultPadded}${recipientPadded}${minSharesHex}`
}

import { NextRequest, NextResponse } from 'next/server'
import { resolveENS, resolveChainAddress } from '@/lib/ens/resolve'
import { findRoutes } from '@/lib/routing/lifi-router'
import { findV4Routes, V4_CHAINS } from '@/lib/routing/v4-router'
// Yield route disabled - see strategies.ts for details
import { getRestakingRouteQuote, isRestakingStrategy } from '@/lib/routing/restaking-router'
import { getMultiVaultRouteQuote, isMultiVaultRoute } from '@/lib/routing/multi-vault-router'
import { getTokenAddress, getPreferredChainForToken, CHAIN_MAP, CHAIN_ID_TO_NAME } from '@/lib/routing/tokens'
import { isRateLimited } from '@/lib/rate-limit'
import { getStrategy, parseStrategyAllocation, type StrategyAllocation } from '@/lib/strategies'
import { calculateFee, getNextTierInfo } from '@/lib/incentives/fee-tiers'
import { getVolumeRecord } from '@/lib/incentives/volume-tracker'
import { isInternalPayment } from '@/lib/incentives/network-effects'
import { calculateReferralReward, getReferrer } from '@/lib/incentives/referrals'

// Stablecoins that should prefer Uniswap v4 for same-chain swaps
const STABLECOINS = new Set(['USDC', 'USDT', 'DAI', 'FRAX', 'LUSD', 'TUSD', 'BUSD'])

function isStablecoin(token: string): boolean {
  return STABLECOINS.has(token.toUpperCase())
}

function isV4Supported(chain: string): boolean {
  const cfg = V4_CHAINS[chain]
  return cfg && cfg.hook !== '0x0000000000000000000000000000000000000000'
}

/**
 * POST /api/quote - Get payment routes without NLP parsing
 *
 * Body: {
 *   amount: string,
 *   fromToken: string,
 *   toToken?: string,
 *   fromChain: string,
 *   toChain?: string,
 *   toAddress: string, // ENS name or 0x address
 *   userAddress: string,
 *   slippage?: number
 * }
 */
export async function POST(req: NextRequest) {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before trying again.' },
      { status: 429 }
    )
  }

  try {
    const {
      amount,
      fromToken,
      toToken,
      fromChain,
      toChain: requestedToChain,
      toAddress,
      userAddress,
      slippage,
    } = await req.json()

    if (!amount || !fromToken || !fromChain || !toAddress || !userAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: amount, fromToken, fromChain, toAddress, userAddress' },
        { status: 400 }
      )
    }

    // --- ENS Resolution ---
    let resolvedAddress = toAddress
    let ensSlippage: number | undefined
    let ensMaxFee: string | undefined
    let ensStrategy: string | undefined
    let ensStrategies: string | undefined
    let strategyAllocations: StrategyAllocation[] = []
    let toChain = requestedToChain || fromChain

    if (toAddress.endsWith('.eth')) {
      const ensResult = await resolveENS(toAddress)
      if (!ensResult.address) {
        return NextResponse.json({
          error: `Could not resolve ENS name "${toAddress}"`,
        }, { status: 404 })
      }
      resolvedAddress = ensResult.address

      // Apply ENS preferences as defaults
      if (ensResult.preferredChain && !requestedToChain) {
        toChain = ensResult.preferredChain
      }
      if (ensResult.preferredSlippage) {
        const parsed = parseFloat(ensResult.preferredSlippage)
        if (!Number.isNaN(parsed) && parsed > 0) {
          ensSlippage = parsed / 100
        }
      }
      ensMaxFee = ensResult.maxFee
      ensStrategy = ensResult.strategy
      ensStrategies = ensResult.strategies

      // Parse strategy allocation (multi-strategy takes precedence)
      strategyAllocations = parseStrategyAllocation(ensStrategy, ensStrategies)
    }

    // Determine final toToken based on strategy
    let finalToToken = toToken || fromToken
    // Restaking strategy receives WETH (converted to ezETH), liquid receives USDC
    if (ensStrategy === 'restaking') {
      finalToToken = 'WETH'
      toChain = 'base'
    } else {
      // Default to USDC for liquid strategy
      finalToToken = 'USDC'
      toChain = 'base'
    }

    // Auto-resolve destination chain if toToken isn't available there
    const toChainId = CHAIN_MAP[toChain] || CHAIN_MAP.ethereum
    if (!getTokenAddress(finalToToken, toChainId)) {
      const bestChainId = getPreferredChainForToken(finalToToken)
      if (bestChainId && CHAIN_ID_TO_NAME[bestChainId]) {
        toChain = CHAIN_ID_TO_NAME[bestChainId]
      }
    }

    // ENSIP-9: resolve chain-specific address for L2
    const finalToChainId = CHAIN_MAP[toChain] || CHAIN_MAP.ethereum
    if (toAddress.endsWith('.eth') && finalToChainId !== 1) {
      const chainAddr = await resolveChainAddress(toAddress, finalToChainId)
      if (chainAddr) {
        resolvedAddress = chainAddr
      }
    }

    // Effective slippage
    const effectiveSlippage = slippage ?? ensSlippage

    let allRoutes: Awaited<ReturnType<typeof findRoutes>> = []

    // Get the strategy configuration
    const strategy = getStrategy(ensStrategy)

    // --- MULTI-VAULT ROUTE: If multi-strategy allocation, split to multiple vaults ---
    if (isMultiVaultRoute(strategyAllocations)) {
      const multiVaultResult = await getMultiVaultRouteQuote({
        fromAddress: userAddress,
        fromChain,
        fromToken,
        amount,
        recipient: resolvedAddress,
        allocations: strategyAllocations,
        slippage: effectiveSlippage,
      })

      if ('error' in multiVaultResult) {
        // Fall back to single strategy if multi-vault fails
        console.warn('Multi-vault route failed, falling back to single strategy:', multiVaultResult.error)
      } else {
        // Multi-vault route found - splits to multiple destinations in ONE tx
        return NextResponse.json({
          routes: [multiVaultResult.route],
          resolvedAddress,
          toChain: 'base',
          toToken: 'USDC',
          strategy: 'multi',
          strategyName: 'Multi-Strategy',
          useMultiVaultRoute: true,
          strategyAllocations,
          isMultiStrategy: true,
          allocations: multiVaultResult.allocations,
        })
      }
    }

    // --- RESTAKING ROUTE: If strategy is restaking, route to Renzo ---
    if (isRestakingStrategy(ensStrategy)) {
      const restakingResult = await getRestakingRouteQuote({
        fromAddress: userAddress,
        fromChain,
        fromToken,
        amount,
        recipient: resolvedAddress,
        slippage: effectiveSlippage,
      })

      if ('error' in restakingResult) {
        // Fall back to standard routes if restaking route fails
        console.warn('Restaking route failed, falling back to standard:', restakingResult.error)
      } else {
        // Restaking route found - bridges + deposits to Renzo in ONE tx
        allRoutes = [restakingResult.route]

        return NextResponse.json({
          routes: allRoutes,
          resolvedAddress,
          toChain: 'base', // Renzo is on Base
          toToken: 'ezETH',
          strategy: strategy.id,
          strategyName: strategy.name,
          protocol: strategy.protocol,
          useRestakingRoute: true,
          strategyAllocations: strategyAllocations.length > 1 ? strategyAllocations : undefined,
          isMultiStrategy: strategyAllocations.length > 1,
        })
      }
    }

    // Note: Yield strategy (vault deposits) is disabled due to LI.FI contract calls bug.
    // All payments now go directly to recipient as USDC (liquid) or ezETH (restaking).

    // --- STANDARD ROUTES: No vault or yield route failed ---

    // Same token, same chain = simple transfer (no bridge/swap needed)
    const isSameTokenSameChain =
      fromToken.toUpperCase() === finalToToken.toUpperCase() &&
      fromChain.toLowerCase() === toChain.toLowerCase()

    // Track if we're using a v4 route (for response)
    let useV4Route = false

    if (isSameTokenSameChain) {
      // Direct transfer - no routing needed
      allRoutes = [{
        id: 'direct-transfer',
        path: `${fromToken} → ${finalToToken}`,
        fee: '$0.00',
        estimatedTime: '< 1 min',
        provider: 'Direct Transfer',
        routeType: 'standard',
      }]
    } else {
      // Check for v4 hook routes (same-chain stablecoin swaps)
      const v4Routes = findV4Routes({
        fromChain,
        toChain,
        fromToken,
        toToken: finalToToken,
        amount,
      })

      // Find routes via LI.FI
      const lifiRoutes = await findRoutes({
        fromAddress: userAddress,
        fromChain,
        toChain,
        fromToken,
        toToken: finalToToken,
        amount,
        slippage: effectiveSlippage,
      })

      // Prioritize v4 routes for same-chain stablecoin swaps
      const isSameChain = fromChain.toLowerCase() === toChain.toLowerCase()
      const isStablecoinSwap = isStablecoin(fromToken) || isStablecoin(finalToToken)
      const hasV4Support = isV4Supported(fromChain)

      if (v4Routes.length > 0 && isSameChain && isStablecoinSwap && hasV4Support) {
        // V4 routes first for eligible swaps
        allRoutes = [...v4Routes, ...lifiRoutes]
        useV4Route = true
      } else {
        // Standard ordering: LI.FI routes first
        allRoutes = [...lifiRoutes, ...v4Routes]
      }
    }

    // Filter by maxFee if set
    if (ensMaxFee) {
      const maxFeeNum = parseFloat(ensMaxFee)
      if (!Number.isNaN(maxFeeNum) && maxFeeNum > 0) {
        const filtered = allRoutes.filter((r) => {
          const feeNum = parseFloat(r.fee.replace(/[^0-9.]/g, ''))
          return Number.isNaN(feeNum) || feeNum <= maxFeeNum
        })
        if (filtered.length > 0) {
          allRoutes = filtered
        }
      }
    }

    // Calculate fee tier for receiver
    const amountNum = parseFloat(amount) || 0
    const volumeRecord = getVolumeRecord(toAddress)

    // Check for internal payment (receiver-to-receiver = 0% fee)
    const internalCheck = isInternalPayment(userAddress, toAddress)

    const feeInfo = calculateFee({
      amountUsd: amountNum,
      monthlyVolumeUsd: volumeRecord.monthlyVolumeUsd,
      receiverHasGasTank: false, // TODO: check GasTankRegistry
      isInternalPayment: internalCheck.isInternal,
    })
    const tierInfo = getNextTierInfo(volumeRecord.monthlyVolumeUsd)

    // Calculate referral reward (if receiver was referred)
    const referralInfo = calculateReferralReward(toAddress, feeInfo.feeAmount)

    return NextResponse.json({
      routes: allRoutes,
      resolvedAddress,
      toChain,
      toToken: finalToToken,
      strategy: ensStrategy || 'liquid',
      useV4Route,
      // Multi-strategy allocation info
      strategyAllocations: strategyAllocations.length > 1 ? strategyAllocations : undefined,
      isMultiStrategy: strategyAllocations.length > 1,
      // Fee tier info (incentive system)
      feeTier: {
        tier: feeInfo.tier.name,
        feePercent: feeInfo.feePercent,
        feeAmount: feeInfo.feeAmount.toFixed(2),
        reason: feeInfo.reason,
        monthlyVolume: volumeRecord.monthlyVolumeUsd,
        // Progress to next tier
        nextTier: tierInfo.nextTier?.name || null,
        volumeToNextTier: tierInfo.volumeToNextTier,
        percentToNextTier: tierInfo.percentToNextTier.toFixed(0),
        // Referral info (if receiver was referred, someone earns from this payment)
        referrer: referralInfo.referrer,
        referralReward: referralInfo.referrer ? referralInfo.referralReward.toFixed(2) : null,
      },
    })
  } catch (error: unknown) {
    console.error('Quote API error:', error)
    const message = error instanceof Error ? error.message : 'Failed to get quote'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

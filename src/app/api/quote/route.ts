import { NextRequest, NextResponse } from 'next/server'
import { resolveENS, resolveChainAddress } from '@/lib/ens/resolve'
import { findRoutes } from '@/lib/routing/lifi-router'
import { findV4Routes } from '@/lib/routing/v4-router'
import { getYieldRouteQuote, isYieldRouteEnabled } from '@/lib/routing/yield-router'
import { getTokenAddress, getPreferredChainForToken, CHAIN_MAP, CHAIN_ID_TO_NAME } from '@/lib/routing/tokens'
import { isRateLimited } from '@/lib/rate-limit'

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
    let yieldVault: string | undefined
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
      yieldVault = ensResult.yieldVault
    }

    // Determine final toToken (use fromToken if not specified, or ENS preference)
    const finalToToken = toToken || fromToken

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

    // --- YIELD ROUTE: If recipient has vault, use Contract Calls for atomic deposit ---
    if (isYieldRouteEnabled(yieldVault)) {
      const yieldResult = await getYieldRouteQuote({
        fromAddress: userAddress,
        fromChain,
        fromToken,
        amount,
        recipient: resolvedAddress,
        vault: yieldVault!,
        slippage: effectiveSlippage,
      })

      if ('error' in yieldResult) {
        // Fall back to standard routes if yield route fails
        console.warn('Yield route failed, falling back to standard:', yieldResult.error)
      } else {
        // Yield route found - this bridges + deposits in ONE tx
        allRoutes = [yieldResult.route]

        return NextResponse.json({
          routes: allRoutes,
          resolvedAddress,
          toChain: 'base', // YieldRouter is always on Base
          toToken: 'USDC',
          yieldVault, // Include vault so execute knows to use yield route
          useYieldRoute: true,
        })
      }
    }

    // --- STANDARD ROUTES: No vault or yield route failed ---

    // Same token, same chain = simple transfer (no bridge/swap needed)
    const isSameTokenSameChain =
      fromToken.toUpperCase() === finalToToken.toUpperCase() &&
      fromChain.toLowerCase() === toChain.toLowerCase()

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

      // Check for v4 hook routes (same-chain stablecoin swaps)
      const v4Routes = findV4Routes({
        fromChain,
        toChain,
        fromToken,
        toToken: finalToToken,
        amount,
      })

      allRoutes = [...v4Routes, ...lifiRoutes]
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

    return NextResponse.json({
      routes: allRoutes,
      resolvedAddress,
      toChain,
      toToken: finalToToken,
      yieldVault: yieldVault || null,
      useYieldRoute: false,
    })
  } catch (error: unknown) {
    console.error('Quote API error:', error)
    const message = error instanceof Error ? error.message : 'Failed to get quote'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

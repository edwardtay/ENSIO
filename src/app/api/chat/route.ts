import { NextRequest, NextResponse } from 'next/server'
import { parseIntent } from '@/lib/ai/parse-intent'
import { resolveENS } from '@/lib/ens/resolve'
import { probeX402 } from '@/lib/x402/client'
import { findRoutes, findComposerRoutes } from '@/lib/routing/lifi-router'
import { findV4Routes } from '@/lib/routing/v4-router'
import { isRateLimited } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before trying again.' },
      { status: 429 }
    )
  }

  try {
    const { message, userAddress, slippage } = await req.json()

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const intent = await parseIntent(message)

    // --- ENS Resolution ---
    let resolvedAddress: string | undefined
    let ensNote = ''
    let ensAvatar: string | undefined
    let ensDescription: string | undefined
    let ensSlippage: number | undefined
    let ensMaxFee: string | undefined
    if (intent.toAddress && intent.toAddress.endsWith('.eth')) {
      const ensResult = await resolveENS(intent.toAddress)
      if (!ensResult.address) {
        return NextResponse.json({
          content: `Could not resolve ENS name "${intent.toAddress}". Please check the name and try again.`,
          intent,
        })
      }
      resolvedAddress = ensResult.address
      ensNote = `Resolved ${intent.toAddress} → ${resolvedAddress}`

      // Capture profile fields for the response
      ensAvatar = ensResult.avatar
      ensDescription = ensResult.description

      // Build human-readable preference summary
      const prefParts: string[] = []
      if (ensResult.preferredToken) prefParts.push(ensResult.preferredToken)
      if (ensResult.preferredChain) prefParts.push(`on ${ensResult.preferredChain}`)
      if (ensResult.preferredSlippage) prefParts.push(`slippage ≤${ensResult.preferredSlippage}%`)
      if (ensResult.maxFee) prefParts.push(`max fee $${ensResult.maxFee}`)
      if (prefParts.length > 0) {
        ensNote += ` (prefers ${prefParts.join(', ')})`
      }
      if (ensDescription) {
        ensNote += `\nProfile: ${ensDescription}`
      }

      // Apply ENS payment preferences as defaults when not already specified
      if (ensResult.preferredChain && !intent.toChain) {
        intent.toChain = ensResult.preferredChain
      }
      if (ensResult.preferredToken && !intent.toToken) {
        intent.toToken = ensResult.preferredToken
      }
      // Parse slippage preference — use it only when the caller did not provide one
      if (ensResult.preferredSlippage) {
        const parsed = parseFloat(ensResult.preferredSlippage)
        if (!Number.isNaN(parsed) && parsed > 0) {
          ensSlippage = parsed / 100 // text record stores %, SDK expects fraction
        }
      }
      ensMaxFee = ensResult.maxFee
    }

    // Build a human-readable agent response
    let agentMessage = ''
    const displayAddress = resolvedAddress || intent.toAddress
    switch (intent.action) {
      case 'transfer':
        agentMessage = `I'll transfer ${intent.amount} ${intent.fromToken}${displayAddress ? ` to ${displayAddress}` : ''}${intent.toChain ? ` on ${intent.toChain}` : ''}. Finding the best route...`
        break
      case 'swap':
        agentMessage = `I'll swap ${intent.amount} ${intent.fromToken} to ${intent.toToken}${intent.toChain ? ` on ${intent.toChain}` : ''}. Comparing rates...`
        break
      case 'deposit':
        agentMessage = `I'll deposit ${intent.amount} ${intent.fromToken} into ${intent.vaultProtocol || 'a lending'} vault${intent.toChain ? ` on ${intent.toChain}` : ''}. Finding Composer routes...`
        break
      case 'yield':
        agentMessage = `I'll find the best yield for ${intent.amount} ${intent.fromToken}${intent.toChain ? ` on ${intent.toChain}` : ''} via ${intent.vaultProtocol || 'available'} vaults. Finding Composer routes...`
        break
      case 'pay_x402': {
        if (intent.url) {
          // Construct full URL if relative path provided
          let fullUrl = intent.url
          if (fullUrl.startsWith('/')) {
            const host = req.headers.get('host') || 'localhost:3000'
            const protocol = req.headers.get('x-forwarded-proto') || 'http'
            fullUrl = `${protocol}://${host}${fullUrl}`
          }

          const paymentDetails = await probeX402(fullUrl)
          if (paymentDetails) {
            agentMessage = `Paywall detected at ${intent.url}. Payment required: ${paymentDetails.amount} ${paymentDetails.token} on ${paymentDetails.chain} to ${paymentDetails.recipient}. I can handle this payment for you.`

            const x402Routes = [
              {
                id: 'x402-pay',
                path: `Pay ${paymentDetails.amount} ${paymentDetails.token} on ${paymentDetails.chain}`,
                fee: `${paymentDetails.amount} ${paymentDetails.token}`,
                estimatedTime: '~10s',
                provider: 'x402',
                routeType: 'standard' as const,
              },
            ]

            if (ensNote) {
              agentMessage = `${ensNote}\n\n${agentMessage}`
            }

            return NextResponse.json({
              content: agentMessage,
              intent,
              routes: x402Routes,
              ...(resolvedAddress ? { resolvedAddress } : {}),
            })
          } else {
            agentMessage = `I checked ${intent.url} but no x402 paywall was detected. The resource may be freely accessible.`
          }
        } else {
          agentMessage = `No URL provided for x402 payment. Please specify the URL you want to access.`
        }
        break
      }
    }

    // Prepend ENS resolution note if applicable
    if (ensNote) {
      agentMessage = `${ensNote}\n\n${agentMessage}`
    }

    // Find routes based on action type
    let routes = undefined

    if (intent.action === 'transfer' || intent.action === 'swap') {
      // --- Standard LI.FI routes for transfers and swaps ---
      const fromAddr = userAddress || '0x0000000000000000000000000000000000000000'
      const fromChain = intent.fromChain || 'ethereum'
      const toChain = intent.toChain || intent.fromChain || 'ethereum'

      // ENS slippage preference is used when the caller did not supply one
      const effectiveSlippage = slippage ?? ensSlippage

      const lifiRoutes = await findRoutes({
        fromAddress: fromAddr,
        fromChain,
        toChain,
        fromToken: intent.fromToken,
        toToken: intent.toToken,
        amount: intent.amount,
        slippage: effectiveSlippage,
      })

      // For swap actions, check if a v4 hook route applies (same-chain stablecoin swaps)
      const v4Routes =
        intent.action === 'swap'
          ? findV4Routes({
              fromChain,
              toChain,
              fromToken: intent.fromToken,
              toToken: intent.toToken,
              amount: intent.amount,
            })
          : []

      let allRoutes = [...v4Routes, ...lifiRoutes]

      // If the recipient set a maxFee preference, filter out routes that exceed it
      if (ensMaxFee) {
        const maxFeeNum = parseFloat(ensMaxFee)
        if (!Number.isNaN(maxFeeNum) && maxFeeNum > 0) {
          const filtered = allRoutes.filter((r) => {
            const feeNum = parseFloat(r.fee.replace(/[^0-9.]/g, ''))
            return Number.isNaN(feeNum) || feeNum <= maxFeeNum
          })
          if (filtered.length > 0) {
            allRoutes = filtered
          } else {
            // Keep all routes but warn the user
            agentMessage += `\n\nNote: No routes found within the recipient's preferred max fee of $${ensMaxFee}. Showing all available routes.`
          }
        }
      }

      routes = allRoutes
    } else if (intent.action === 'deposit' || intent.action === 'yield') {
      // --- Composer routes for vault deposits and yield ---
      const fromAddr = userAddress || '0x0000000000000000000000000000000000000000'
      const fromChain = intent.fromChain || 'ethereum'
      const toChain = intent.toChain || intent.fromChain || 'ethereum'
      const vaultProtocol = intent.vaultProtocol || 'aave'

      const composerRoutes = await findComposerRoutes({
        fromAddress: fromAddr,
        fromChain,
        toChain,
        fromToken: intent.fromToken,
        amount: intent.amount,
        vaultProtocol,
        slippage,
      })

      // If user didn't specify a protocol, also try the other vaults for comparison
      if (!intent.vaultProtocol) {
        const altProtocol = vaultProtocol === 'aave' ? 'morpho' : 'aave'
        const altRoutes = await findComposerRoutes({
          fromAddress: fromAddr,
          fromChain,
          toChain,
          fromToken: intent.fromToken,
          amount: intent.amount,
          vaultProtocol: altProtocol,
          slippage,
        })
        routes = [...composerRoutes, ...altRoutes]
      } else {
        routes = composerRoutes
      }
    }

    // Build ENS profile payload when we resolved an ENS name
    const ensProfile =
      ensAvatar || ensDescription
        ? { avatar: ensAvatar, description: ensDescription }
        : undefined

    return NextResponse.json({
      content: agentMessage,
      intent,
      routes,
      ...(resolvedAddress ? { resolvedAddress } : {}),
      ...(ensProfile ? { ensProfile } : {}),
    })
  } catch (error: unknown) {
    console.error('Chat API error:', error)
    const message = error instanceof Error ? error.message : 'Failed to process message'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

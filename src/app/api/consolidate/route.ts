import { NextRequest, NextResponse } from 'next/server'
import { resolveENS } from '@/lib/ens/resolve'
import { isRateLimited } from '@/lib/rate-limit'
import {
  getMultiChainBalances,
  detectConsolidationOpportunity,
  buildConsolidationPlan,
} from '@/lib/agent/consolidation'

export async function POST(req: NextRequest) {
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before trying again.' },
      { status: 429 }
    )
  }

  try {
    const { walletAddress, ensName } = await req.json()

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 }
      )
    }

    // Read ENS config if ensName provided, otherwise use defaults
    let ensConfig: {
      address: string | null
      preferredChain?: string
      preferredToken?: string
      autoConsolidate?: string
    } = {
      address: walletAddress,
      preferredChain: 'base',
      preferredToken: 'USDC',
    }

    if (ensName && ensName.endsWith('.eth')) {
      const resolved = await resolveENS(ensName)
      if (resolved.address) {
        ensConfig = {
          ...resolved,
          preferredChain: resolved.preferredChain || 'base',
          preferredToken: resolved.preferredToken || 'USDC',
        }
      }
    }

    // Scan balances across all chains
    const balances = await getMultiChainBalances(walletAddress)

    // Detect what needs consolidating
    const opportunities = detectConsolidationOpportunity(balances, ensConfig)

    // Build the consolidation plan
    const plan = buildConsolidationPlan(opportunities, ensConfig)

    return NextResponse.json({
      balances,
      opportunities,
      plan,
      ensConfig: {
        preferredToken: ensConfig.preferredToken,
        preferredChain: ensConfig.preferredChain,
        autoConsolidate: ensConfig.autoConsolidate,
      },
    })
  } catch (error: unknown) {
    console.error('Consolidation API error:', error)
    const message =
      error instanceof Error ? error.message : 'Failed to process consolidation'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

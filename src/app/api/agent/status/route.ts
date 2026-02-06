import { NextRequest, NextResponse } from 'next/server'
import {
  checkTankStatus,
  getMultichainBalances,
  getYieldSuggestions,
  agentCheckAndRefill,
} from '@/lib/agent/payment-agent'
import { type Address } from 'viem'

/**
 * GET /api/agent/status?address=0x...
 *
 * Get the AI agent status for a receiver
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address') as Address | null

  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 })
  }

  try {
    // Get all agent data in parallel
    const [tankStatus, balances, yieldSuggestions, agentAction] =
      await Promise.all([
        checkTankStatus(address),
        getMultichainBalances(address),
        getYieldSuggestions(address),
        agentCheckAndRefill(address),
      ])

    return NextResponse.json({
      receiver: address,
      tank: {
        balance: tankStatus.tankBalance.toString(),
        needsRefill: tankStatus.needsRefill,
        defaultVault: tankStatus.defaultVault,
      },
      balances: balances.map((b) => ({
        chain: b.chain,
        balance: b.balanceFormatted,
      })),
      yield: yieldSuggestions,
      agent: {
        action: agentAction.action,
        message: agentAction.message,
        details: agentAction.details,
      },
      lastChecked: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Agent status error:', error)
    return NextResponse.json(
      { error: 'Failed to get agent status' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/agent/status
 *
 * Trigger agent action (refill, rebalance, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { address, action } = body as {
      address: Address
      action: 'refill' | 'rebalance'
    }

    if (!address || !action) {
      return NextResponse.json(
        { error: 'Address and action required' },
        { status: 400 }
      )
    }

    if (action === 'refill') {
      const result = await agentCheckAndRefill(address)
      return NextResponse.json({
        success: true,
        action: result.action,
        message: result.message,
        details: result.details,
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Agent action error:', error)
    return NextResponse.json(
      { error: 'Failed to execute agent action' },
      { status: 500 }
    )
  }
}

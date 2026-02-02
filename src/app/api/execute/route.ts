import { NextRequest, NextResponse } from 'next/server'
import { getTransactionData } from '@/lib/routing/execute-route'
import type { ParsedIntent } from '@/lib/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { fromAddress, intent, slippage } = body as {
      routeId: string
      fromAddress: string
      intent: ParsedIntent
      slippage?: number
    }

    if (!fromAddress || !intent) {
      return NextResponse.json(
        { error: 'Missing fromAddress or intent' },
        { status: 400 }
      )
    }

    // Deposit/yield intents resolve the vault token internally, so toToken
    // is not required for those actions.
    const isComposerAction =
      intent.action === 'deposit' || intent.action === 'yield'

    if (!intent.fromToken || !intent.amount) {
      return NextResponse.json(
        { error: 'Incomplete intent: fromToken and amount required' },
        { status: 400 }
      )
    }

    if (!isComposerAction && !intent.toToken) {
      return NextResponse.json(
        { error: 'Incomplete intent: toToken required for transfer/swap' },
        { status: 400 }
      )
    }

    const txData = await getTransactionData(intent, fromAddress, slippage)

    return NextResponse.json(txData)
  } catch (error: unknown) {
    console.error('Execute API error:', error)
    const message =
      error instanceof Error ? error.message : 'Failed to prepare transaction'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

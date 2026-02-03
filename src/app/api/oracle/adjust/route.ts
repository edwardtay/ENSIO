import { NextRequest, NextResponse } from 'next/server'
import { executeFeeAdjustment } from '@/lib/agent/oracle-agent'

export async function POST(req: NextRequest) {
  try {
    const { fee } = await req.json()

    if (typeof fee !== 'number' || fee < 0 || fee > 10000) {
      return NextResponse.json(
        { error: 'Invalid fee. Must be 0-10000 (hundredths of a bip).' },
        { status: 400 }
      )
    }

    const result = await executeFeeAdjustment(fee)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Fee adjustment failed' },
        { status: 500 }
      )
    }

    return NextResponse.json(result)
  } catch (error: unknown) {
    console.error('Oracle adjust API error:', error)
    const message = error instanceof Error ? error.message : 'Failed to adjust fee'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

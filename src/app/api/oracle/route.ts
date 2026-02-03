import { NextResponse } from 'next/server'
import { getOracleState } from '@/lib/agent/oracle-agent'

export async function GET() {
  try {
    const state = await getOracleState()
    return NextResponse.json(state)
  } catch (error: unknown) {
    console.error('Oracle API error:', error)
    const message = error instanceof Error ? error.message : 'Failed to get oracle state'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

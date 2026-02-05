import { NextRequest, NextResponse } from 'next/server'
import { resolveENS } from '@/lib/ens/resolve'

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name')

  if (!name) {
    return NextResponse.json(
      { error: 'Missing name parameter' },
      { status: 400 }
    )
  }

  // Basic validation - must look like an ENS name
  if (!name.includes('.')) {
    return NextResponse.json(
      { error: 'Invalid ENS name format' },
      { status: 400 }
    )
  }

  try {
    const result = await resolveENS(name)
    return NextResponse.json(result)
  } catch (error) {
    console.error('ENS resolve error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Resolution failed' },
      { status: 500 }
    )
  }
}

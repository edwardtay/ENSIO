import { NextRequest, NextResponse } from 'next/server'
import { getMultichainName } from '@/lib/ens/multichain'

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  const chainId = req.nextUrl.searchParams.get('chainId')

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Valid address is required' }, { status: 400 })
  }

  const chain = chainId ? parseInt(chainId, 10) : 1
  if (Number.isNaN(chain)) {
    return NextResponse.json({ error: 'Invalid chainId' }, { status: 400 })
  }

  try {
    const name = await getMultichainName(address, chain)
    return NextResponse.json({ name })
  } catch {
    return NextResponse.json({ name: null })
  }
}

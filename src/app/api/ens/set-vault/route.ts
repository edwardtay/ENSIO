import { NextRequest, NextResponse } from 'next/server'
import { buildSetYieldVaultTransaction } from '@/lib/ens/write'

export async function POST(request: NextRequest) {
  try {
    const { ensName, vaultAddress } = await request.json()

    if (!ensName || typeof ensName !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid ensName' },
        { status: 400 }
      )
    }

    if (!vaultAddress || typeof vaultAddress !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid vaultAddress' },
        { status: 400 }
      )
    }

    // Basic validation for Ethereum address
    if (!/^0x[a-fA-F0-9]{40}$/.test(vaultAddress)) {
      return NextResponse.json(
        { error: 'Invalid vault address format' },
        { status: 400 }
      )
    }

    const txData = await buildSetYieldVaultTransaction(ensName, vaultAddress)

    return NextResponse.json(txData)
  } catch (error) {
    console.error('Set vault error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to build transaction' },
      { status: 500 }
    )
  }
}

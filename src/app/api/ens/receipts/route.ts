import { NextRequest, NextResponse } from 'next/server'
import { storeReceipt, getReceiptsByRecipient } from '@/lib/ens/receipt-store'
import { generateReceiptSubname } from '@/lib/ens/receipts'

export async function GET(req: NextRequest) {
  const recipient = req.nextUrl.searchParams.get('recipient')
  if (!recipient) {
    return NextResponse.json({ error: 'Missing recipient parameter' }, { status: 400 })
  }

  try {
    const receipts = await getReceiptsByRecipient(recipient)
    return NextResponse.json({ receipts })
  } catch (error: unknown) {
    console.error('Receipt fetch error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch receipts'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { txHash, amount, token, chain, recipient, from, receiverENS } = await req.json()

    if (!txHash || !amount || !token || !chain || !recipient || !from) {
      return NextResponse.json(
        { error: 'Missing required fields: txHash, amount, token, chain, recipient, from' },
        { status: 400 },
      )
    }

    await storeReceipt(txHash, amount, token, chain, recipient, from, receiverENS)

    const subname = generateReceiptSubname(txHash)

    return NextResponse.json({
      subname,
      // If ENS name provided, also return the FlowFi CCIP-Read pattern
      flowFiSubname: receiverENS ? `tx-${txHash.toLowerCase().slice(0, 10)}.payments.${receiverENS}` : undefined,
    })
  } catch (error: unknown) {
    console.error('Receipt store error:', error)
    const message = error instanceof Error ? error.message : 'Failed to store receipt'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

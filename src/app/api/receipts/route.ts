import { NextRequest, NextResponse } from 'next/server'
import {
  getReceiptsByENS,
  getReceiptByTxHash,
  getAllReceipts,
} from '@/lib/ens/receipt-store'
import { generateReceiptSubnameForENS } from '@/lib/ens/receipts'

/**
 * GET /api/receipts
 *
 * Query payment receipts with support for:
 * - ?ens=alice.eth - List all receipts for an ENS name
 * - ?tx=0xabc123 - Get a specific receipt by transaction hash
 * - No params - List all receipts (for admin/debugging)
 *
 * Returns receipts with their corresponding CCIP-Read subname pattern:
 * tx-{shortHash}.payments.{name}.eth
 */
export async function GET(req: NextRequest) {
  const ens = req.nextUrl.searchParams.get('ens')
  const tx = req.nextUrl.searchParams.get('tx')

  try {
    // Query by transaction hash
    if (tx) {
      const receipt = await getReceiptByTxHash(tx)
      if (!receipt) {
        return NextResponse.json(
          { error: 'Receipt not found' },
          { status: 404 }
        )
      }

      // Generate the CCIP-Read subname for this receipt
      const subname = receipt.receiver.endsWith('.eth')
        ? generateReceiptSubnameForENS(receipt.txHash, receipt.receiver)
        : null

      return NextResponse.json({
        receipt,
        subname,
        ccipReadKeys: [
          'com.flowfi.amount',
          'com.flowfi.token',
          'com.flowfi.sender',
          'com.flowfi.chain',
          'com.flowfi.timestamp',
          'com.flowfi.txHash',
        ],
      })
    }

    // Query by ENS name
    if (ens) {
      const receipts = await getReceiptsByENS(ens)

      // Add subnames to each receipt
      const receiptsWithSubnames = receipts.map((receipt) => ({
        ...receipt,
        subname: generateReceiptSubnameForENS(receipt.txHash, ens),
      }))

      return NextResponse.json({
        ens,
        receipts: receiptsWithSubnames,
        count: receipts.length,
      })
    }

    // Return all receipts (for debugging/admin)
    const allReceipts = await getAllReceipts()
    return NextResponse.json({
      receipts: allReceipts,
      count: allReceipts.length,
    })
  } catch (error: unknown) {
    console.error('Receipts API error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch receipts'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

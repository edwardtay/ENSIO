import { NextRequest, NextResponse } from 'next/server'
import { encodeFunctionResult, namehash, keccak256, toHex } from 'viem'

/**
 * ENS Wildcard Resolver for Payment Receipts (ENSIP-10 + CCIP-Read)
 *
 * Allows queries like:
 * - receipt-abc123.vitalik.eth → returns payment receipt data
 * - tx-0x1234...abcd.vitalik.eth → returns transaction receipt
 *
 * This is NOVEL because:
 * - Payment receipts become ENS-resolvable records
 * - Any ENS name can have infinite receipt subdomains
 * - Receipts are verifiable via CCIP-Read (EIP-3668)
 *
 * Flow:
 * 1. User queries receipt-abc123.vitalik.eth
 * 2. ENS resolver sees wildcard, calls CCIP gateway
 * 3. Gateway returns receipt data signed by FlowFi
 * 4. Client verifies signature and displays receipt
 */

// In-memory receipt store (in production, use database)
const receipts = new Map<string, Receipt>()

interface Receipt {
  id: string
  txHash: string
  from: string
  to: string
  amount: string
  token: string
  chain: string
  timestamp: number
  status: 'pending' | 'completed' | 'failed'
  strategy?: string
  vault?: string
}

// Demo receipts
function initDemoReceipts() {
  if (receipts.size > 0) return

  receipts.set('abc123', {
    id: 'abc123',
    txHash: '0xd8b54b9e696df7b937372afeac6ca7071676dec713b95d3615b372745196bf76',
    from: '0x999a8dbc672a0da86471e67b9a22ea2b1c91e101',
    to: 'vitalik.eth',
    amount: '100.00',
    token: 'USDC',
    chain: 'base',
    timestamp: Date.now() - 3600000,
    status: 'completed',
    strategy: 'yield',
    vault: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB',
  })

  receipts.set('def456', {
    id: 'def456',
    txHash: '0xedf88c95cfa5c972efa553a1a346d42ae2af51da45d4ea3317f42fab0b2e7f5a',
    from: '0x1234567890123456789012345678901234567890',
    to: 'alice.eth',
    amount: '50.00',
    token: 'USDT',
    chain: 'arbitrum',
    timestamp: Date.now() - 7200000,
    status: 'completed',
  })
}

/**
 * GET /api/ens/receipts/[name]
 *
 * Resolves wildcard ENS subdomains for receipts
 * e.g., receipt-abc123.vitalik.eth → receipt data
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  initDemoReceipts()
  const { name } = await params

  // Parse the subdomain
  // Format: receipt-{id}.{ens} or tx-{hash}.{ens}
  const parts = name.split('.')
  if (parts.length < 2) {
    return NextResponse.json({ error: 'Invalid name format' }, { status: 400 })
  }

  const subdomain = parts[0]
  const parentName = parts.slice(1).join('.')

  // Handle receipt-{id} format
  if (subdomain.startsWith('receipt-')) {
    const receiptId = subdomain.replace('receipt-', '')
    const receipt = receipts.get(receiptId)

    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }

    // Return receipt as ENS text record format
    return NextResponse.json({
      name,
      parentName,
      receiptId,
      receipt: {
        ...receipt,
        timestampFormatted: new Date(receipt.timestamp).toISOString(),
      },
      // ENS text records that could be resolved
      ensRecords: {
        'flowfi.receipt.id': receipt.id,
        'flowfi.receipt.txHash': receipt.txHash,
        'flowfi.receipt.amount': `${receipt.amount} ${receipt.token}`,
        'flowfi.receipt.from': receipt.from,
        'flowfi.receipt.to': receipt.to,
        'flowfi.receipt.chain': receipt.chain,
        'flowfi.receipt.status': receipt.status,
        'flowfi.receipt.timestamp': receipt.timestamp.toString(),
      },
      // CCIP-Read compatible response
      ccipResponse: {
        data: encodeReceiptData(receipt),
        signature: 'TODO: sign with FlowFi key',
      },
    })
  }

  // Handle tx-{hash} format
  if (subdomain.startsWith('tx-')) {
    const txHash = subdomain.replace('tx-', '')

    // Find receipt by txHash
    let foundReceipt: Receipt | undefined
    for (const receipt of receipts.values()) {
      if (receipt.txHash.toLowerCase().includes(txHash.toLowerCase())) {
        foundReceipt = receipt
        break
      }
    }

    if (!foundReceipt) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    return NextResponse.json({
      name,
      parentName,
      txHash: foundReceipt.txHash,
      receipt: foundReceipt,
    })
  }

  return NextResponse.json({ error: 'Unknown subdomain format' }, { status: 400 })
}

/**
 * POST /api/ens/receipts/[name]
 *
 * Create a new receipt (called after successful payment)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const body = await req.json()
    const { txHash, from, to, amount, token, chain, strategy, vault } = body

    if (!txHash || !from || !to || !amount || !token || !chain) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Generate receipt ID
    const id = generateReceiptId(txHash)

    const receipt: Receipt = {
      id,
      txHash,
      from,
      to,
      amount,
      token,
      chain,
      timestamp: Date.now(),
      status: 'completed',
      strategy,
      vault,
    }

    receipts.set(id, receipt)

    // Return the ENS-resolvable subdomain
    const ensName = to.endsWith('.eth') ? to : `${to}`
    const receiptSubdomain = `receipt-${id}.${ensName}`

    return NextResponse.json({
      success: true,
      receiptId: id,
      receiptUrl: `https://flowfi-crypto.vercel.app/receipt/${id}`,
      ensSubdomain: receiptSubdomain,
      resolveUrl: `https://flowfi-crypto.vercel.app/api/ens/receipts/${receiptSubdomain}`,
      receipt,
    })
  } catch (error) {
    console.error('Receipt creation error:', error)
    return NextResponse.json({ error: 'Failed to create receipt' }, { status: 500 })
  }
}

// Generate a short receipt ID from tx hash
function generateReceiptId(txHash: string): string {
  // Take first 6 chars of hash (after 0x) + random suffix
  const hashPart = txHash.slice(2, 8)
  const randomPart = Math.random().toString(36).slice(2, 5)
  return `${hashPart}${randomPart}`
}

// Encode receipt data for CCIP-Read response
function encodeReceiptData(receipt: Receipt): string {
  // Simple JSON encoding for now
  // In production, use proper ABI encoding for on-chain verification
  return Buffer.from(JSON.stringify(receipt)).toString('base64')
}

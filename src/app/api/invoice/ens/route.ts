import { NextRequest, NextResponse } from 'next/server'
import {
  buildSetInvoiceTransaction,
  buildCreateInvoiceSubdomainTransaction,
  getInvoiceFromENS,
  getInvoiceFromSubdomain,
  subdomainExists,
  type InvoiceData,
} from '@/lib/ens/write'

/**
 * POST /api/invoice/ens - Build transaction to store invoice in ENS
 *   - mode=text (default): Store as text record on parent name
 *   - mode=subdomain: Create inv-{id}.name.eth subdomain (deeper ENS integration)
 * GET /api/invoice/ens?ensName=xxx&id=yyy - Read invoice from ENS
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { ensName, invoice, ownerAddress, mode = 'text' } = body as {
      ensName: string
      invoice: InvoiceData
      ownerAddress?: string
      mode?: 'text' | 'subdomain'
    }

    if (!ensName || !invoice?.id || !invoice?.amount) {
      return NextResponse.json(
        { error: 'Missing required fields: ensName, invoice.id, invoice.amount' },
        { status: 400 }
      )
    }

    // Subdomain mode: Create inv-{id}.name.eth
    if (mode === 'subdomain') {
      if (!ownerAddress) {
        return NextResponse.json(
          { error: 'ownerAddress required for subdomain mode' },
          { status: 400 }
        )
      }

      const result = await buildCreateInvoiceSubdomainTransaction(ensName, invoice, ownerAddress)

      return NextResponse.json({
        mode: 'subdomain',
        subdomain: result.subdomain,
        invoiceHash: result.invoiceHash,
        transactions: result.transactions,
        message: `Create invoice subdomain: ${result.subdomain}`,
        paymentUrl: `ensio.xyz/pay/${result.subdomain}`,
      })
    }

    // Default: Text record mode
    const txData = await buildSetInvoiceTransaction(ensName, invoice)

    return NextResponse.json({
      mode: 'text',
      ...txData,
      message: `Store invoice ${invoice.id} in ENS record: flowfi.invoice.${invoice.id}`,
    })
  } catch (error) {
    console.error('Invoice ENS write error:', error)
    const message = error instanceof Error ? error.message : 'Failed to build ENS transaction'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const ensName = req.nextUrl.searchParams.get('ensName')
    const id = req.nextUrl.searchParams.get('id')

    if (!ensName || !id) {
      return NextResponse.json(
        { error: 'Missing required params: ensName, id' },
        { status: 400 }
      )
    }

    // Try subdomain first (inv-{id}.name.eth)
    const subdomainRecord = await getInvoiceFromSubdomain(ensName, id)
    if (subdomainRecord) {
      return NextResponse.json({
        ...subdomainRecord,
        ensName,
        invoiceId: id,
        mode: 'subdomain',
        paymentUrl: `ensio.xyz/pay/${subdomainRecord.subdomain}`,
        verified: true,
      })
    }

    // Fallback to text record on parent name
    const record = await getInvoiceFromENS(ensName, id)
    if (record) {
      return NextResponse.json({
        ...record,
        ensName,
        invoiceId: id,
        mode: 'text',
        recordKey: `flowfi.invoice.${id}`,
        verified: true,
      })
    }

    // Check if subdomain exists but has no invoice data
    const subdomain = `inv-${id}.${ensName}`
    const exists = await subdomainExists(subdomain)

    return NextResponse.json(
      {
        error: 'Invoice not found in ENS',
        verified: false,
        subdomainExists: exists,
        checkedLocations: [
          `${subdomain} (subdomain)`,
          `${ensName} flowfi.invoice.${id} (text record)`,
        ],
      },
      { status: 404 }
    )
  } catch (error) {
    console.error('Invoice ENS read error:', error)
    const message = error instanceof Error ? error.message : 'Failed to read from ENS'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

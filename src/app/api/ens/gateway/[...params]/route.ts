import { NextRequest, NextResponse } from 'next/server'
import {
  decodeAbiParameters,
  encodeAbiParameters,
  type Hex,
} from 'viem'
import { getPreference, getPreferenceByNode } from '@/lib/ens/store'
import { getReceipt, getFlowFiReceipt } from '@/lib/ens/receipt-store'
import { signGatewayResponse } from '@/lib/ens/gateway-signer'

/**
 * Decode a DNS wire-format name into its labels.
 * e.g. \x05alice\x08payagent\x03eth\x00 → ["alice", "payagent", "eth"]
 */
function decodeDnsName(dnsBytes: Uint8Array): string[] {
  const labels: string[] = []
  let offset = 0
  while (offset < dnsBytes.length) {
    const len = dnsBytes[offset]
    if (len === 0) break
    offset++
    const label = new TextDecoder().decode(dnsBytes.slice(offset, offset + len))
    labels.push(label)
    offset += len
  }
  return labels
}

type ParsedSubname =
  | { type: 'preference'; name: string }
  | { type: 'receipt'; txHash: string }
  | { type: 'payment-request'; amount: string; token: string; recipient: string }
  | { type: 'apy'; vaultType: string; parentName: string }
  | { type: 'invoice-status'; invoiceId: string; parentName: string }
  | null

const PAYMENT_REQUEST_RE = /^pay-(\d+(?:\.\d+)?)-([a-zA-Z]+)$/i
const INVOICE_STATUS_RE = /^status\.inv-([a-zA-Z0-9]+)$/i

// Dynamic APY data (in production, fetch from DeFiLlama or on-chain)
const APY_DATA: Record<string, { apy: string; tvl: string; protocol: string }> = {
  aave: { apy: '4.82%', tvl: '$1.2B', protocol: 'Aave v3' },
  morpho: { apy: '6.45%', tvl: '$450M', protocol: 'Morpho Blue' },
  moonwell: { apy: '5.12%', tvl: '$180M', protocol: 'Moonwell' },
  default: { apy: '5.50%', tvl: '$500M', protocol: 'Mixed' },
}

// Invoice status (in production, fetch from database)
async function getInvoiceStatus(invoiceId: string): Promise<{ status: string; amount?: string; paidAt?: string } | null> {
  // For demo, return sample data
  // In production, this would query the invoice database
  return {
    status: 'pending',
    amount: '100 USDC',
  }
}

/**
 * Parse a wildcard DNS name into its subname type.
 *
 * Supports:
 *   - "alice.payagent.eth" → preference lookup for "alice.eth"
 *   - "tx-0xabc.payments.payagent.eth" → receipt lookup for txHash "0xabc"
 *   - "pay-10-usdc.alice.payagent.eth" → payment request (amount=10, token=USDC, recipient=alice.eth)
 *   - "apy.alice.eth" → current APY for alice's vault
 *   - "status.inv-123.alice.eth" → invoice status
 */
function parseSubname(labels: string[]): ParsedSubname {
  if (labels.length < 3) return null

  const firstLabel = labels[0]

  // APY lookup: apy.{name}.eth (3+ labels, first is "apy")
  if (firstLabel === 'apy' && labels.length >= 3) {
    const parentName = labels.slice(1).join('.')
    return { type: 'apy', vaultType: 'default', parentName }
  }

  // Invoice status: status.inv-{id}.{name}.eth
  if (firstLabel === 'status' && labels.length >= 4 && labels[1].startsWith('inv-')) {
    const invoiceId = labels[1].slice(4) // remove "inv-" prefix
    const parentName = labels.slice(2).join('.')
    return { type: 'invoice-status', invoiceId, parentName }
  }

  // Receipt subname: tx-{hash}.payments.payagent.eth (4+ labels, first starts with "tx-")
  if (firstLabel.startsWith('tx-') && labels.length >= 4) {
    const txHash = firstLabel.slice(3) // remove "tx-" prefix
    return { type: 'receipt', txHash }
  }

  // Payment request: pay-{amount}-{token}.{recipient}.payagent.eth (4+ labels)
  if (labels.length >= 4) {
    const match = firstLabel.match(PAYMENT_REQUEST_RE)
    if (match) {
      const recipient = `${labels[1]}.eth`
      return { type: 'payment-request', amount: match[1], token: match[2].toUpperCase(), recipient }
    }
  }

  // Default: preference lookup — first label is the user identifier
  return { type: 'preference', name: `${firstLabel}.eth` }
}

/**
 * GET /api/ens/gateway/{sender}/{data}.json
 *
 * ERC-3668 CCIP-Read gateway with ENSIP-10 wildcard support.
 *
 * Called by ENS clients after receiving an OffchainLookup revert from
 * PayAgentResolver. The extraData format is:
 *   abi.encode(bytes dnsName, bytes resolverCalldata)
 *
 * The gateway decodes the DNS name to identify the subname (wildcard),
 * extracts the text key from the resolver calldata, looks up the
 * preference in the offchain store, and returns a signed response.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ params: string[] }> },
) {
  try {
    const segments = (await params).params
    if (!segments || segments.length < 2) {
      return NextResponse.json({ error: 'Invalid gateway URL format' }, { status: 400 })
    }

    const sender = segments[0] as Hex
    const dataSegment = segments[1].replace(/\.json$/, '') as Hex
    const extraData = dataSegment

    // Decode extraData: abi.encode(bytes dnsName, bytes resolverCalldata)
    let dnsNameHex: Hex
    let resolverCalldata: Hex
    try {
      const decoded = decodeAbiParameters(
        [
          { name: 'name', type: 'bytes' },
          { name: 'data', type: 'bytes' },
        ],
        extraData,
      )
      dnsNameHex = decoded[0] as Hex
      resolverCalldata = decoded[1] as Hex
    } catch {
      return NextResponse.json({ error: 'Failed to decode extraData' }, { status: 400 })
    }

    // Parse the DNS wire-format name
    const dnsBytes = Buffer.from(dnsNameHex.slice(2), 'hex')
    const labels = decodeDnsName(dnsBytes)

    // Extract text key from resolver calldata: text(bytes32 node, string key)
    // Skip 4 bytes selector
    let node: Hex
    let key: string
    try {
      const decoded = decodeAbiParameters(
        [
          { name: 'node', type: 'bytes32' },
          { name: 'key', type: 'string' },
        ],
        ('0x' + resolverCalldata.slice(10)) as Hex, // skip 4-byte selector (8 hex chars + 0x)
      )
      node = decoded[0]
      key = decoded[1]
    } catch {
      return NextResponse.json({ error: 'Failed to decode resolver calldata' }, { status: 400 })
    }

    // Parse the subname to determine the type of lookup
    const parsed = parseSubname(labels)
    let resultValue = ''

    if (parsed?.type === 'apy') {
      // APY lookup: return dynamic yield data
      // In production, this would fetch from DeFiLlama or on-chain
      const apyInfo = APY_DATA[parsed.vaultType] || APY_DATA.default

      if (key === 'flowfi.apy') {
        resultValue = apyInfo.apy
      } else if (key === 'flowfi.tvl') {
        resultValue = apyInfo.tvl
      } else if (key === 'flowfi.protocol') {
        resultValue = apyInfo.protocol
      } else if (key === 'description') {
        resultValue = `Current APY: ${apyInfo.apy} via ${apyInfo.protocol}`
      }
    } else if (parsed?.type === 'invoice-status') {
      // Invoice status: return dynamic invoice state
      const invoiceStatus = await getInvoiceStatus(parsed.invoiceId)

      if (invoiceStatus) {
        if (key === 'flowfi.invoice.status') {
          resultValue = invoiceStatus.status
        } else if (key === 'flowfi.invoice.amount') {
          resultValue = invoiceStatus.amount || ''
        } else if (key === 'flowfi.invoice.paidAt') {
          resultValue = invoiceStatus.paidAt || ''
        } else if (key === 'description') {
          resultValue = `Invoice ${parsed.invoiceId}: ${invoiceStatus.status}`
        }
      }
    } else if (parsed?.type === 'receipt') {
      // Receipt lookup: return text record values from stored receipt
      // Support both com.payagent.* and com.flowfi.* keys
      if (key.startsWith('com.flowfi.')) {
        const flowFiReceipt = await getFlowFiReceipt(parsed.txHash)
        if (flowFiReceipt && key in flowFiReceipt) {
          resultValue = flowFiReceipt[key as keyof typeof flowFiReceipt]
        }
      } else {
        const receipt = await getReceipt(parsed.txHash)
        if (receipt && key in receipt) {
          resultValue = receipt[key as keyof typeof receipt]
        }
      }
    } else if (parsed?.type === 'payment-request') {
      // Payment request: dynamically generate values from the name structure
      if (key === 'com.payagent.amount') {
        resultValue = parsed.amount
      } else if (key === 'com.payagent.token') {
        resultValue = parsed.token
      } else if (key === 'com.payagent.recipient') {
        resultValue = parsed.recipient
      }
    } else {
      // Preference lookup — try by user name first (wildcard), fall back to node
      let preference: { token: string; chain: string } | null = null

      if (parsed?.type === 'preference') {
        preference = await getPreference(parsed.name)
      }

      // Fall back to node-based lookup for direct resolution
      if (!preference) {
        preference = await getPreferenceByNode(node)
      }

      if (preference) {
        if (key === 'com.payagent.token') {
          resultValue = preference.token
        } else if (key === 'com.payagent.chain') {
          resultValue = preference.chain
        }
      }
    }

    // ABI-encode the result as a string
    const result = encodeAbiParameters(
      [{ name: 'value', type: 'string' }],
      [resultValue],
    )

    // Sign the response
    const expires = BigInt(Math.floor(Date.now() / 1000) + 300) // 5 min expiry
    const signature = await signGatewayResponse(sender, expires, extraData, result)

    // Return the signed response: abi.encode(bytes result, uint64 expires, bytes signature)
    const responseData = encodeAbiParameters(
      [
        { name: 'result', type: 'bytes' },
        { name: 'expires', type: 'uint64' },
        { name: 'signature', type: 'bytes' },
      ],
      [result, expires, signature],
    )

    return NextResponse.json({ data: responseData })
  } catch (error: unknown) {
    console.error('CCIP-Read gateway error:', error)
    const message = error instanceof Error ? error.message : 'Gateway error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

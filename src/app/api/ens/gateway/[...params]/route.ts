import { NextRequest, NextResponse } from 'next/server'
import {
  decodeAbiParameters,
  encodeAbiParameters,
  type Hex,
} from 'viem'
import { getPreference, getPreferenceByNode } from '@/lib/ens/store'
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

/**
 * Extract the user's ENS name from a wildcard DNS name.
 *
 * For "alice.payagent.eth" → first label "alice" → look up "alice.eth"
 * For "payagent.eth" (parent) → no subname, fall back to node-based lookup
 */
function extractUserName(labels: string[]): string | null {
  // If there are 3+ labels (subname.parent.tld), the first label is the user identifier
  if (labels.length >= 3) {
    // Reconstruct the user's ENS name: first label + ".eth"
    return `${labels[0]}.eth`
  }
  // Parent name (e.g. "payagent.eth") — no user-specific subname
  return null
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

    // Look up preference — try by user name first (wildcard), fall back to node
    let preference: { token: string; chain: string } | null = null

    const userName = extractUserName(labels)
    if (userName) {
      preference = await getPreference(userName)
    }

    // Fall back to node-based lookup for direct resolution
    if (!preference) {
      preference = await getPreferenceByNode(node)
    }

    let resultValue = ''
    if (preference) {
      if (key === 'com.payagent.token') {
        resultValue = preference.token
      } else if (key === 'com.payagent.chain') {
        resultValue = preference.chain
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

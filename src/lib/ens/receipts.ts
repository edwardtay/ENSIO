import type { ReceiptTextRecords, FlowFiReceiptTextRecords } from '@/lib/types'

/**
 * Payment receipt subname utilities.
 *
 * These are pure data-structure helpers. Actual on-chain subname creation
 * would require a registrar / name-wrapper contract interaction.
 */

/** Default parent name under which receipt subnames live. */
const DEFAULT_PARENT = 'payments.payagent.eth'

/**
 * Build FlowFi-namespaced text records for CCIP-Read resolution.
 * Pattern: tx-{shortHash}.payments.{name}.eth
 *
 * @returns A plain object whose keys are FlowFi ENS text-record keys.
 */
export function buildFlowFiReceiptTextRecords(
  txHash: string,
  amount: string,
  token: string,
  chain: string,
  sender: string,
  timestamp: number,
): FlowFiReceiptTextRecords {
  return {
    'com.flowfi.amount': amount,
    'com.flowfi.token': token,
    'com.flowfi.sender': sender,
    'com.flowfi.chain': chain,
    'com.flowfi.timestamp': timestamp.toString(),
    'com.flowfi.txHash': txHash,
  }
}

/**
 * Generate a receipt subname for a specific ENS name.
 * Pattern: tx-{shortHash}.payments.{name}.eth
 *
 * @example
 *   generateReceiptSubnameForENS('0xabc123def456', 'alice.eth')
 *   // => "tx-0xabc123.payments.alice.eth"
 */
export function generateReceiptSubnameForENS(
  txHash: string,
  ensName: string,
): string {
  // Use first 8 chars of tx hash (after 0x) for a shorter subname
  const shortHash = txHash.toLowerCase().slice(0, 10) // 0x + 8 chars
  return `tx-${shortHash}.payments.${ensName}`
}

/**
 * Generate a deterministic receipt subname from a transaction hash.
 *
 * @example
 *   generateReceiptSubname('0xabc123def456')
 *   // => "tx-0xabc123def456.payments.payagent.eth"
 *
 *   generateReceiptSubname('0xabc123def456', 'receipts.mydapp.eth')
 *   // => "tx-0xabc123def456.receipts.mydapp.eth"
 */
export function generateReceiptSubname(
  txHash: string,
  parentName: string = DEFAULT_PARENT,
): string {
  // Normalise the hash to lowercase for consistency
  const normalizedHash = txHash.toLowerCase()
  return `tx-${normalizedHash}.${parentName}`
}

/**
 * Build a set of ENS text records that encode the details of a payment
 * receipt. These records can be set on the subname produced by
 * `generateReceiptSubname`.
 *
 * @returns A plain object whose keys are ENS text-record keys.
 */
export function buildReceiptTextRecords(
  txHash: string,
  amount: string,
  token: string,
  chain: string,
  recipient: string,
): ReceiptTextRecords {
  return {
    'com.payagent.tx': txHash,
    'com.payagent.amount': amount,
    'com.payagent.token': token,
    'com.payagent.chain': chain,
    'com.payagent.recipient': recipient,
    'com.payagent.timestamp': new Date().toISOString(),
  }
}

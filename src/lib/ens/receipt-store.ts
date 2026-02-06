/**
 * JSON-file receipt store for offchain ENS payment receipts.
 *
 * Reads/writes `data/ens-receipts.json` in the project root.
 * Each entry is keyed by transaction hash.
 *
 * Supports:
 * - Lookup by transaction hash
 * - Lookup by ENS name (receiver)
 * - FlowFi text records for CCIP-Read resolution
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { buildReceiptTextRecords, buildFlowFiReceiptTextRecords } from './receipts'
import type { ReceiptTextRecords, FlowFiReceiptTextRecords, PaymentReceipt } from '@/lib/types'

type StoredReceipt = {
  amount: string
  token: string
  chain: string
  recipient: string // address
  receiverENS?: string // ENS name
  from: string
  textRecords: ReceiptTextRecords
  flowFiTextRecords: FlowFiReceiptTextRecords
  timestamp: number
  createdAt: string
}

type ReceiptStore = Record<string, StoredReceipt>

const DATA_DIR = path.join(process.cwd(), 'data')
const STORE_PATH = path.join(DATA_DIR, 'ens-receipts.json')

async function readStore(): Promise<ReceiptStore> {
  try {
    const raw = await readFile(STORE_PATH, 'utf-8')
    return JSON.parse(raw) as ReceiptStore
  } catch {
    return {}
  }
}

async function writeStore(store: ReceiptStore): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true })
  }
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8')
}

export async function storeReceipt(
  txHash: string,
  amount: string,
  token: string,
  chain: string,
  recipient: string,
  from: string,
  receiverENS?: string,
): Promise<void> {
  const store = await readStore()
  const timestamp = Date.now()
  const textRecords = buildReceiptTextRecords(txHash, amount, token, chain, recipient)
  const flowFiTextRecords = buildFlowFiReceiptTextRecords(txHash, amount, token, chain, from, timestamp)
  store[txHash.toLowerCase()] = {
    amount,
    token,
    chain,
    recipient,
    receiverENS: receiverENS?.toLowerCase(),
    from: from.toLowerCase(),
    textRecords,
    flowFiTextRecords,
    timestamp,
    createdAt: new Date(timestamp).toISOString(),
  }
  await writeStore(store)
}

export async function getReceipt(txHash: string): Promise<ReceiptTextRecords | null> {
  const store = await readStore()
  const entry = store[txHash.toLowerCase()]
  if (!entry) return null
  return entry.textRecords
}

/**
 * Get FlowFi text records for a receipt by transaction hash.
 * Used by CCIP-Read gateway for resolving tx-{hash}.payments.{name}.eth
 */
export async function getFlowFiReceipt(txHash: string): Promise<FlowFiReceiptTextRecords | null> {
  const store = await readStore()
  // Handle both full hash and short hash (first 10 chars including 0x)
  const normalizedHash = txHash.toLowerCase()

  // Try exact match first
  if (store[normalizedHash]) {
    return store[normalizedHash].flowFiTextRecords
  }

  // Try matching by prefix (for short hashes like 0xabc123)
  for (const [hash, entry] of Object.entries(store)) {
    if (hash.startsWith(normalizedHash) || normalizedHash.startsWith(hash.slice(0, normalizedHash.length))) {
      return entry.flowFiTextRecords
    }
  }

  return null
}

/**
 * Get full receipt data by transaction hash.
 */
export async function getReceiptByTxHash(txHash: string): Promise<PaymentReceipt | null> {
  const store = await readStore()
  const normalizedHash = txHash.toLowerCase()

  // Try exact match first
  let entry = store[normalizedHash]

  // Try matching by prefix (for short hashes)
  if (!entry) {
    for (const [hash, e] of Object.entries(store)) {
      if (hash.startsWith(normalizedHash) || normalizedHash.startsWith(hash.slice(0, normalizedHash.length))) {
        entry = e
        break
      }
    }
  }

  if (!entry) return null

  return {
    txHash: entry.flowFiTextRecords['com.flowfi.txHash'],
    amount: entry.amount,
    token: entry.token,
    sender: entry.from,
    receiver: entry.receiverENS || entry.recipient,
    chain: entry.chain,
    timestamp: entry.timestamp,
  }
}

export async function getReceiptsByRecipient(recipientAddress: string): Promise<Array<{
  txHash: string
  amount: string
  token: string
  chain: string
  from: string
  createdAt: string
}>> {
  const store = await readStore()
  const receipts: Array<{
    txHash: string
    amount: string
    token: string
    chain: string
    from: string
    createdAt: string
  }> = []

  for (const [txHash, entry] of Object.entries(store)) {
    if (entry.recipient.toLowerCase() === recipientAddress.toLowerCase()) {
      receipts.push({
        txHash,
        amount: entry.amount,
        token: entry.token,
        chain: entry.chain,
        from: entry.from,
        createdAt: entry.createdAt,
      })
    }
  }

  // Sort by date descending (newest first)
  return receipts.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

/**
 * Get all receipts for a specific ENS name.
 * Used by /api/receipts?ens=alice.eth
 */
export async function getReceiptsByENS(ensName: string): Promise<PaymentReceipt[]> {
  const store = await readStore()
  const receipts: PaymentReceipt[] = []
  const normalizedENS = ensName.toLowerCase()

  for (const [, entry] of Object.entries(store)) {
    if (entry.receiverENS?.toLowerCase() === normalizedENS) {
      receipts.push({
        txHash: entry.flowFiTextRecords['com.flowfi.txHash'],
        amount: entry.amount,
        token: entry.token,
        sender: entry.from,
        receiver: entry.receiverENS || entry.recipient,
        chain: entry.chain,
        timestamp: entry.timestamp,
      })
    }
  }

  // Sort by timestamp descending (newest first)
  return receipts.sort((a, b) => b.timestamp - a.timestamp)
}

/**
 * Get all receipts in the store.
 */
export async function getAllReceipts(): Promise<PaymentReceipt[]> {
  const store = await readStore()
  const receipts: PaymentReceipt[] = []

  for (const [, entry] of Object.entries(store)) {
    receipts.push({
      txHash: entry.flowFiTextRecords['com.flowfi.txHash'],
      amount: entry.amount,
      token: entry.token,
      sender: entry.from,
      receiver: entry.receiverENS || entry.recipient,
      chain: entry.chain,
      timestamp: entry.timestamp,
    })
  }

  // Sort by timestamp descending (newest first)
  return receipts.sort((a, b) => b.timestamp - a.timestamp)
}

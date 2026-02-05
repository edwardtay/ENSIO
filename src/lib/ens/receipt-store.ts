/**
 * JSON-file receipt store for offchain ENS payment receipts.
 *
 * Reads/writes `data/ens-receipts.json` in the project root.
 * Each entry is keyed by transaction hash.
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { buildReceiptTextRecords } from './receipts'
import type { ReceiptTextRecords } from '@/lib/types'

type StoredReceipt = {
  amount: string
  token: string
  chain: string
  recipient: string
  from: string
  textRecords: ReceiptTextRecords
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
): Promise<void> {
  const store = await readStore()
  const textRecords = buildReceiptTextRecords(txHash, amount, token, chain, recipient)
  store[txHash.toLowerCase()] = {
    amount,
    token,
    chain,
    recipient,
    from: from.toLowerCase(),
    textRecords,
    createdAt: new Date().toISOString(),
  }
  await writeStore(store)
}

export async function getReceipt(txHash: string): Promise<ReceiptTextRecords | null> {
  const store = await readStore()
  const entry = store[txHash.toLowerCase()]
  if (!entry) return null
  return entry.textRecords
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

/**
 * JSON-file preference store for offchain ENS preferences.
 *
 * Reads/writes `data/ens-preferences.json` in the project root.
 * Each entry is keyed by normalised ENS name.
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { namehash } from 'viem/ens'

type StoredPreference = {
  token: string
  chain: string
  signer: string
  signature: string
  updatedAt: string
}

type PreferenceStore = Record<string, StoredPreference>

const DATA_DIR = path.join(process.cwd(), 'data')
const STORE_PATH = path.join(DATA_DIR, 'ens-preferences.json')

async function readStore(): Promise<PreferenceStore> {
  try {
    const raw = await readFile(STORE_PATH, 'utf-8')
    return JSON.parse(raw) as PreferenceStore
  } catch {
    return {}
  }
}

async function writeStore(store: PreferenceStore): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true })
  }
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8')
}

export async function getPreference(
  ensName: string,
): Promise<{ token: string; chain: string } | null> {
  const store = await readStore()
  const entry = store[ensName.toLowerCase()]
  if (!entry) return null
  return { token: entry.token, chain: entry.chain }
}

export async function getPreferenceByNode(
  node: string,
): Promise<{ token: string; chain: string } | null> {
  const store = await readStore()
  // Search through all entries to find one whose namehash matches
  for (const [name, entry] of Object.entries(store)) {
    try {
      if (namehash(name) === node) {
        return { token: entry.token, chain: entry.chain }
      }
    } catch {
      continue
    }
  }
  return null
}

export async function setPreference(
  ensName: string,
  token: string,
  chain: string,
  signer: string,
  signature: string,
): Promise<void> {
  const store = await readStore()
  store[ensName.toLowerCase()] = {
    token,
    chain,
    signer: signer.toLowerCase(),
    signature,
    updatedAt: new Date().toISOString(),
  }
  await writeStore(store)
}

export async function getNonce(ensName: string): Promise<bigint> {
  const store = await readStore()
  const entry = store[ensName.toLowerCase()]
  if (!entry) return BigInt(0)
  // Nonce = number of times preference has been set (simple monotonic counter)
  // We derive it from updatedAt to keep it simple
  return BigInt(Math.floor(new Date(entry.updatedAt).getTime() / 1000))
}

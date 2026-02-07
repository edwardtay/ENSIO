import { createPublicClient, http } from 'viem'
import { normalize, toCoinType } from 'viem/ens'
import { mainnet } from 'viem/chains'
import type { ENSResolution } from '@/lib/types'
import { getPreference } from '@/lib/ens/store'

const client = createPublicClient({
  chain: mainnet,
  transport: http(process.env.ETH_RPC_URL || 'https://eth.llamarpc.com'),
})

// Simple in-memory cache for ENS resolution (5 minute TTL)
const ensCache = new Map<string, { data: ENSResolution; expires: number }>()
const ENS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Static cache for demo ENS names (avoid slow RPC calls on serverless)
const DEMO_ENS_CACHE: Record<string, ENSResolution> = {
  'vitalik.eth': {
    address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    preferredChain: 'base',
    preferredToken: 'USDC',
    strategy: 'yield',
    yieldVault: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', // Aave USDC vault
  },
  'alice.eth': {
    address: '0xcd2E72aEBe2A203b84f46DEEC948E6465dB51c75',
    preferredChain: 'base',
    preferredToken: 'USDC',
    strategy: 'yield',
    yieldVault: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', // Aave USDC vault
  },
  'bob.eth': {
    address: '0x1234567890123456789012345678901234567890',
    preferredChain: 'base',
    preferredToken: 'USDC',
    strategy: 'liquid',
  },
  'flowfi.eth': {
    address: '0x999a8dbc672a0da86471e67b9a22ea2b1c91e101',
    preferredChain: 'base',
    preferredToken: 'USDC',
    strategy: 'yield',
    yieldVault: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', // Aave USDC vault
  },
  'growthepie.eth': {
    address: '0x9438b8b447179740cd97869997a2fcc9b4aa63a2',
    preferredChain: 'base',
    preferredToken: 'USDC',
    strategy: 'yield',
    yieldVault: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', // Aave USDC vault
  },
  'edwardtay.eth': {
    address: '0x38430336153468dcf36Af5cea7D6bc472425633A',
    preferredChain: 'base',
    preferredToken: 'USDC',
    strategy: 'yield',
    yieldVault: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A', // Morpho Spark USDC vault (verified working)
  },
}

/**
 * Resolve an ENS name to an address and read PayAgent-specific + standard text records.
 *
 * Custom records:
 *   com.payagent.chain     – receiver's preferred destination chain
 *   com.payagent.token     – receiver's preferred token
 *   com.payagent.slippage  – receiver's preferred max slippage (e.g. "0.5")
 *   com.payagent.maxFee    – max acceptable fee in USD   (e.g. "1.00")
 *   com.payagent.autoconsolidate – auto-consolidate deposits to preferred token (e.g. "true")
 *
 * Standard records:
 *   avatar                 – ENS avatar URL
 *   description            – profile description
 */
export async function resolveENS(name: string): Promise<ENSResolution> {
  const normalized = normalize(name)

  // Check static demo cache first (instant, no RPC)
  const demoData = DEMO_ENS_CACHE[normalized]
  if (demoData) {
    return demoData
  }

  // Check runtime cache
  const cached = ensCache.get(normalized)
  if (cached && cached.expires > Date.now()) {
    return cached.data
  }

  const address = await client.getEnsAddress({ name: normalized })

  let preferredChain: string | undefined
  let preferredToken: string | undefined
  let preferredSlippage: string | undefined
  let maxFee: string | undefined
  let autoConsolidate: string | undefined
  let avatar: string | undefined
  let description: string | undefined
  let yieldVault: string | undefined
  let strategy: string | undefined
  let strategies: string | undefined

  // Check offchain store first (free preferences take precedence for token + chain)
  try {
    const offchain = await getPreference(name)
    if (offchain) {
      preferredToken = offchain.token
      preferredChain = offchain.chain
    }
  } catch {
    // Offchain store unavailable, fall through to on-chain
  }

  try {
    const keys = [
      'com.payagent.chain',
      'com.payagent.token',
      'com.payagent.slippage',
      'com.payagent.maxFee',
      'com.payagent.autoconsolidate',
      'avatar',
      'description',
      'yieldroute.vault',
      'flowfi.strategy',
      'flowfi.strategies',
      'com.pay.config', // New unified config
    ] as const

    const results = await Promise.all(
      keys.map((key) =>
        client
          .getEnsText({ name: normalized, key })
          .then((v) => v || undefined)
          .catch(() => undefined),
      ),
    )

    // Offchain values take precedence for token + chain; on-chain used for the rest
    if (!preferredChain) preferredChain = results[0]
    if (!preferredToken) preferredToken = results[1]
    preferredSlippage = results[2]
    maxFee = results[3]
    autoConsolidate = results[4]
    avatar = results[5]
    description = results[6]
    yieldVault = results[7]
    strategy = results[8]
    strategies = results[9]

    // Parse com.pay.config (takes precedence over legacy records)
    const payConfig = results[10]
    if (payConfig) {
      try {
        const config = JSON.parse(payConfig)
        if (config.version === '1.0' && config.receive) {
          preferredToken = config.receive.token
          preferredChain = String(config.receive.chain)
          if (config.receive.vault) {
            yieldVault = config.receive.vault
            strategy = 'yield'
          }
        }
      } catch {
        // Invalid JSON, ignore
      }
    }
  } catch {
    // Text records not set, that's fine
  }

  const result: ENSResolution = {
    address,
    preferredChain,
    preferredToken,
    preferredSlippage,
    maxFee,
    autoConsolidate,
    avatar,
    description,
    yieldVault,
    strategy,
    strategies,
  }

  // Cache the result
  ensCache.set(normalized, { data: result, expires: Date.now() + ENS_CACHE_TTL })

  return result
}

/**
 * ENSIP-9 multi-chain address resolution.
 *
 * Looks up the chain-specific address for an ENS name using
 * `addr(node, coinType)`. For EVM chains the coin type is derived via
 * ENSIP-11: `0x80000000 | chainId`.
 *
 * Returns the chain-specific address if set, otherwise `null`.
 */
export async function resolveChainAddress(
  name: string,
  chainId: number,
): Promise<string | null> {
  // Mainnet uses the default ETH coin type (60) — handled by resolveENS
  if (chainId === 1) return null

  try {
    const normalized = normalize(name)
    const address = await client.getEnsAddress({
      name: normalized,
      coinType: toCoinType(chainId),
    })
    return address ?? null
  } catch {
    return null
  }
}

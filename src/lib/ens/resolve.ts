import { createPublicClient, http } from 'viem'
import { normalize } from 'viem/ens'
import { mainnet } from 'viem/chains'
import type { ENSResolution } from '@/lib/types'
import { getPreference } from '@/lib/ens/store'

const client = createPublicClient({
  chain: mainnet,
  transport: http(process.env.ETH_RPC_URL || 'https://eth.llamarpc.com'),
})

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
  const address = await client.getEnsAddress({ name: normalized })

  let preferredChain: string | undefined
  let preferredToken: string | undefined
  let preferredSlippage: string | undefined
  let maxFee: string | undefined
  let autoConsolidate: string | undefined
  let avatar: string | undefined
  let description: string | undefined

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
  } catch {
    // Text records not set, that's fine
  }

  return {
    address,
    preferredChain,
    preferredToken,
    preferredSlippage,
    maxFee,
    autoConsolidate,
    avatar,
    description,
  }
}

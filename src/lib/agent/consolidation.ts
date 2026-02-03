import { createPublicClient, http, erc20Abi, type Address, formatUnits } from 'viem'
import { base, mainnet, arbitrum, optimism } from 'viem/chains'
import type { ENSResolution } from '@/lib/types'
import { findV4Routes } from '@/lib/routing/v4-router'

// Chain configs for multi-chain balance scanning
const CHAIN_CONFIGS = [
  { id: 8453, name: 'base', chain: base, rpc: 'https://mainnet.base.org' },
  { id: 1, name: 'ethereum', chain: mainnet, rpc: 'https://eth.llamarpc.com' },
  { id: 42161, name: 'arbitrum', chain: arbitrum, rpc: 'https://arb1.arbitrum.io/rpc' },
  { id: 10, name: 'optimism', chain: optimism, rpc: 'https://mainnet.optimism.io' },
] as const

// Token addresses per chain
const TOKENS: Record<string, Record<string, { address: Address; decimals: number }>> = {
  base: {
    USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    USDT: { address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 },
    DAI: { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18 },
  },
  ethereum: {
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    DAI: { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
    PAXG: { address: '0x45804880De22913dAFE09f4980848ECE6EcbAf78', decimals: 18 },
  },
  arbitrum: {
    USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
    USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
    DAI: { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
  },
  optimism: {
    USDC: { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
    USDT: { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 },
    DAI: { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
  },
}

// Gold price approximation (updated at runtime via LI.FI quote)
const APPROX_GOLD_PRICE_USD = 2650

/** Capitalize chain name for display */
function cap(chain: string): string {
  if (!chain) return chain
  return chain.charAt(0).toUpperCase() + chain.slice(1)
}

export type TokenBalance = {
  chain: string
  chainId: number
  token: string
  balance: string
  balanceFormatted: string
  balanceUSD: string
  address: Address
}

export type ConsolidationStep = {
  type: 'v4-hook-swap' | 'lifi-bridge' | 'lifi-swap' | 'gold-conversion'
  from: { chain: string; token: string; amount: string }
  to: { chain: string; token: string; amount: string }
  provider: string
  fee: string
  feePercent: string
  estimatedTime: string
  executable: boolean
  description: string
}

export type ConsolidationPlan = {
  steps: ConsolidationStep[]
  totalSavings: string
  targetToken: string
  targetChain: string
  goldConversion?: {
    amountUSDC: string
    estimatedPAXG: string
    goldPriceUSD: number
    provider: string
  }
}

/**
 * Scan wallet balances across all supported chains.
 */
export async function getMultiChainBalances(
  walletAddress: string
): Promise<TokenBalance[]> {
  const balances: TokenBalance[] = []

  const scanPromises = CHAIN_CONFIGS.map(async (chainConfig) => {
    const client = createPublicClient({
      chain: chainConfig.chain,
      transport: http(chainConfig.rpc),
    })

    const chainTokens = TOKENS[chainConfig.name]
    if (!chainTokens) return []

    const tokenEntries = Object.entries(chainTokens)
    const results = await Promise.allSettled(
      tokenEntries.map(([, info]) =>
        client.readContract({
          address: info.address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [walletAddress as Address],
        })
      )
    )

    const chainBalances: TokenBalance[] = []
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value > BigInt(0)) {
        const [symbol, info] = tokenEntries[i]
        const formatted = formatUnits(result.value, info.decimals)
        // Stablecoins are ~$1, PAXG uses gold price
        const usdValue =
          symbol === 'PAXG'
            ? (parseFloat(formatted) * APPROX_GOLD_PRICE_USD).toFixed(2)
            : parseFloat(formatted).toFixed(2)

        chainBalances.push({
          chain: chainConfig.name,
          chainId: chainConfig.id,
          token: symbol,
          balance: result.value.toString(),
          balanceFormatted: parseFloat(formatted).toFixed(
            info.decimals <= 6 ? 2 : 4
          ),
          balanceUSD: usdValue,
          address: info.address,
        })
      }
    })
    return chainBalances
  })

  const allResults = await Promise.allSettled(scanPromises)
  for (const result of allResults) {
    if (result.status === 'fulfilled') {
      balances.push(...result.value)
    }
  }

  return balances
}

/**
 * Detect tokens that don't match the user's ENS preferred store of value.
 */
export function detectConsolidationOpportunity(
  balances: TokenBalance[],
  ensConfig: ENSResolution
): TokenBalance[] {
  const targetToken = ensConfig.preferredToken?.toUpperCase() || 'USDC'
  const targetChain = ensConfig.preferredChain?.toLowerCase() || 'base'

  return balances.filter((b) => {
    // Skip if already the target token on the target chain
    if (
      b.token.toUpperCase() === targetToken &&
      b.chain.toLowerCase() === targetChain
    ) {
      return false
    }
    // Skip very small balances (< $0.10)
    if (parseFloat(b.balanceUSD) < 0.1) return false
    return true
  })
}

/**
 * Build a consolidation plan from detected opportunities.
 */
export function buildConsolidationPlan(
  opportunities: TokenBalance[],
  ensConfig: ENSResolution
): ConsolidationPlan {
  const targetToken = ensConfig.preferredToken?.toUpperCase() || 'USDC'
  const targetChain = ensConfig.preferredChain?.toLowerCase() || 'base'
  const steps: ConsolidationStep[] = []

  for (const opp of opportunities) {
    const isSameChain = opp.chain.toLowerCase() === targetChain

    if (isSameChain) {
      // Same chain, different token → v4 hook swap (on Base) or LI.FI swap
      const isBase = opp.chain.toLowerCase() === 'base'
      const v4Routes = isBase
        ? findV4Routes({
            fromChain: opp.chain,
            toChain: opp.chain,
            fromToken: opp.token,
            toToken: targetToken,
            amount: opp.balanceFormatted,
          })
        : []

      if (v4Routes.length > 0) {
        steps.push({
          type: 'v4-hook-swap',
          from: { chain: opp.chain, token: opp.token, amount: opp.balanceFormatted },
          to: { chain: opp.chain, token: targetToken, amount: opp.balanceFormatted },
          provider: 'Uniswap v4 + PayAgent Hook',
          fee: v4Routes[0].fee,
          feePercent: '0.01%',
          estimatedTime: '~15s',
          executable: true,
          description: `Swap ${opp.balanceFormatted} ${opp.token} → ${targetToken} on ${cap(opp.chain)} (0.01%)`,
        })
      } else {
        steps.push({
          type: 'lifi-swap',
          from: { chain: opp.chain, token: opp.token, amount: opp.balanceFormatted },
          to: { chain: opp.chain, token: targetToken, amount: opp.balanceFormatted },
          provider: 'LI.FI',
          fee: `$${(parseFloat(opp.balanceFormatted) * 0.003).toFixed(2)}`,
          feePercent: '0.30%',
          estimatedTime: '~30s',
          executable: false,
          description: `Swap ${opp.balanceFormatted} ${opp.token} → ${targetToken} on ${cap(opp.chain)}`,
        })
      }
    } else {
      // Different chain → bridge via LI.FI
      steps.push({
        type: 'lifi-bridge',
        from: { chain: opp.chain, token: opp.token, amount: opp.balanceFormatted },
        to: { chain: targetChain, token: targetToken, amount: opp.balanceFormatted },
        provider: 'LI.FI',
        fee: `$${(parseFloat(opp.balanceFormatted) * 0.003).toFixed(2)}`,
        feePercent: '~0.30%',
        estimatedTime: '~2 min',
        executable: false,
        description: `Bridge ${opp.balanceFormatted} ${opp.token} from ${cap(opp.chain)}`,
      })
    }
  }

  // If target is PAXG (gold), add a final gold conversion step
  let goldConversion: ConsolidationPlan['goldConversion']
  if (targetToken === 'PAXG') {
    const totalUSDC = opportunities.reduce(
      (sum, o) => sum + parseFloat(o.balanceUSD),
      0
    )
    const estimatedPAXG = totalUSDC / APPROX_GOLD_PRICE_USD

    goldConversion = {
      amountUSDC: totalUSDC.toFixed(2),
      estimatedPAXG: estimatedPAXG.toFixed(6),
      goldPriceUSD: APPROX_GOLD_PRICE_USD,
      provider: 'LI.FI',
    }

    steps.push({
      type: 'gold-conversion',
      from: { chain: 'ethereum', token: 'USDC', amount: totalUSDC.toFixed(2) },
      to: { chain: 'ethereum', token: 'PAXG', amount: estimatedPAXG.toFixed(6) },
      provider: 'LI.FI',
      fee: `$${(totalUSDC * 0.003).toFixed(2)}`,
      feePercent: '~0.30%',
      estimatedTime: '~3 min',
      executable: false,
      description: `Convert $${totalUSDC.toFixed(2)} USDC → ${estimatedPAXG.toFixed(6)} PAXG on Ethereum`,
    })
  }

  const savings = estimateSavings(steps)

  return {
    steps,
    totalSavings: savings,
    targetToken,
    targetChain,
    goldConversion,
  }
}

/**
 * Compare hook fees (0.01%) vs standard pool fees (0.30%) and estimate dollar savings.
 */
export function estimateSavings(steps: ConsolidationStep[]): string {
  let hookTotal = 0
  let standardTotal = 0

  for (const step of steps) {
    if (step.type === 'v4-hook-swap') {
      const amount = parseFloat(step.from.amount)
      hookTotal += amount * 0.0001 // 0.01%
      standardTotal += amount * 0.003 // 0.30%
    }
  }

  const savings = standardTotal - hookTotal
  if (savings <= 0) return '$0.00'
  return `$${savings.toFixed(2)}`
}

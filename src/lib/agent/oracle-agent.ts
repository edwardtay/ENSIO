import { createPublicClient, createWalletClient, http, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { getStorkPrice, type StorkPriceResult } from '@/lib/circle/stork'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOOK_ADDRESS: Address = '0xA5Cb63B540D4334F01346F3D4C51d5B2fFf050c0'
const POOL_ID = '0xa0d5acc69bb086910e2483f8fc8d6c850bfe0a0240ba280f651984ec2821d169' as const

// Fee tiers in hundredths of a bip (matching PayAgentHook.sol)
const FEE_TIERS = {
  stable: { fee: 100, label: '0.01%', threshold: 0.001 },    // peg deviation < 0.1%
  low: { fee: 500, label: '0.05%', threshold: 0.005 },       // deviation 0.1% – 0.5%
  medium: { fee: 3000, label: '0.30%', threshold: 0.01 },    // deviation 0.5% – 1.0%
  high: { fee: 10000, label: '1.00%', threshold: Infinity },  // deviation > 1.0%
} as const

type FeeTier = keyof typeof FEE_TIERS

const HOOK_ABI = [
  {
    name: 'getEffectiveFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint24' }],
  },
  {
    name: 'setPoolFee',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'poolId', type: 'bytes32' },
      { name: 'fee', type: 'uint24' },
    ],
    outputs: [],
  },
  {
    name: 'swapCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'totalVolume',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'oracle',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PegAnalysis = {
  usdcPrice: StorkPriceResult
  usdtPrice: StorkPriceResult
  pegDeviation: number        // absolute deviation between USDC and USDT
  pegDeviationPercent: string  // human-readable percentage
  pegStatus: 'tight' | 'normal' | 'stressed' | 'depegged'
}

export type FeeRecommendation = {
  currentFee: number
  currentFeeLabel: string
  recommendedFee: number
  recommendedFeeLabel: string
  recommendedTier: FeeTier
  shouldAdjust: boolean
  confidence: number          // 0-1
  reasoning: string[]         // step-by-step AI reasoning
}

export type OracleState = {
  hookAddress: string
  poolId: string
  oracleAddress: string
  analysis: PegAnalysis
  recommendation: FeeRecommendation
  poolStats: {
    swapCount: string
    totalVolume: string
  }
  timestamp: number
}

export type FeeAdjustmentResult = {
  success: boolean
  txHash?: string
  previousFee: number
  newFee: number
  error?: string
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const publicClient = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
})

/**
 * Analyze the USDC/USDT peg stability using Stork oracle price feeds.
 */
export async function analyzePegStability(): Promise<PegAnalysis> {
  const [usdcPrice, usdtPrice] = await Promise.all([
    getStorkPrice('USDCUSD'),
    getStorkPrice('USDTUSD'),
  ])

  const deviation = Math.abs(usdcPrice.price - usdtPrice.price)
  const avgPrice = (usdcPrice.price + usdtPrice.price) / 2
  const deviationPercent = avgPrice > 0 ? (deviation / avgPrice) * 100 : 0

  let pegStatus: PegAnalysis['pegStatus']
  if (deviationPercent < 0.1) pegStatus = 'tight'
  else if (deviationPercent < 0.5) pegStatus = 'normal'
  else if (deviationPercent < 1.0) pegStatus = 'stressed'
  else pegStatus = 'depegged'

  return {
    usdcPrice,
    usdtPrice,
    pegDeviation: deviation,
    pegDeviationPercent: `${deviationPercent.toFixed(4)}%`,
    pegStatus,
  }
}

/**
 * Determine the optimal fee tier based on peg analysis.
 */
export async function recommendFee(
  analysis: PegAnalysis
): Promise<FeeRecommendation> {
  // Read current on-chain fee
  const currentFee = await publicClient.readContract({
    address: HOOK_ADDRESS,
    abi: HOOK_ABI,
    functionName: 'getEffectiveFee',
    args: [POOL_ID],
  })

  const deviationFraction = analysis.pegDeviation

  // Determine recommended tier
  let recommendedTier: FeeTier
  if (deviationFraction < FEE_TIERS.stable.threshold) {
    recommendedTier = 'stable'
  } else if (deviationFraction < FEE_TIERS.low.threshold) {
    recommendedTier = 'low'
  } else if (deviationFraction < FEE_TIERS.medium.threshold) {
    recommendedTier = 'medium'
  } else {
    recommendedTier = 'high'
  }

  const recommended = FEE_TIERS[recommendedTier]
  const shouldAdjust = currentFee !== recommended.fee

  // Confidence based on oracle data freshness
  const minConfidence = Math.min(
    analysis.usdcPrice.confidence,
    analysis.usdtPrice.confidence
  )

  // Build step-by-step reasoning
  const reasoning: string[] = [
    `Fetched real-time prices from Stork Oracle: USDC = $${analysis.usdcPrice.price.toFixed(4)}, USDT = $${analysis.usdtPrice.price.toFixed(4)}`,
    `Computed peg deviation: |$${analysis.usdcPrice.price.toFixed(4)} - $${analysis.usdtPrice.price.toFixed(4)}| = $${analysis.pegDeviation.toFixed(6)} (${analysis.pegDeviationPercent})`,
    `Peg status: ${analysis.pegStatus.toUpperCase()} — ${getPegStatusExplanation(analysis.pegStatus)}`,
    `Fee tier selection: ${recommendedTier} tier → ${recommended.label} (${recommended.fee} hundredths of a bip)`,
    `Current on-chain fee: ${formatFee(currentFee)} — ${shouldAdjust ? `ADJUSTMENT NEEDED to ${recommended.label}` : 'already optimal, no change needed'}`,
    `Data confidence: ${(minConfidence * 100).toFixed(0)}% (based on oracle data freshness)`,
  ]

  return {
    currentFee,
    currentFeeLabel: formatFee(currentFee),
    recommendedFee: recommended.fee,
    recommendedFeeLabel: recommended.label,
    recommendedTier,
    shouldAdjust,
    confidence: minConfidence,
    reasoning,
  }
}

/**
 * Execute an on-chain fee adjustment via the oracle wallet.
 */
export async function executeFeeAdjustment(
  newFee: number
): Promise<FeeAdjustmentResult> {
  const oracleKey = process.env.ORACLE_PRIVATE_KEY || process.env.PRIVATE_KEY
  if (!oracleKey) {
    return {
      success: false,
      previousFee: 0,
      newFee,
      error: 'ORACLE_PRIVATE_KEY not configured',
    }
  }

  try {
    const currentFee = await publicClient.readContract({
      address: HOOK_ADDRESS,
      abi: HOOK_ABI,
      functionName: 'getEffectiveFee',
      args: [POOL_ID],
    })

    const account = privateKeyToAccount(oracleKey as `0x${string}`)
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http('https://mainnet.base.org'),
    })

    const hash = await walletClient.writeContract({
      address: HOOK_ADDRESS,
      abi: HOOK_ABI,
      functionName: 'setPoolFee',
      args: [POOL_ID, newFee],
    })

    return {
      success: true,
      txHash: hash,
      previousFee: currentFee,
      newFee,
    }
  } catch (error) {
    return {
      success: false,
      previousFee: 0,
      newFee,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get complete oracle state for the dashboard.
 */
export async function getOracleState(): Promise<OracleState> {
  const [analysis, oracleAddress, swapCount, totalVolume] = await Promise.all([
    analyzePegStability(),
    publicClient.readContract({
      address: HOOK_ADDRESS,
      abi: HOOK_ABI,
      functionName: 'oracle',
    }),
    publicClient.readContract({
      address: HOOK_ADDRESS,
      abi: HOOK_ABI,
      functionName: 'swapCount',
      args: [POOL_ID],
    }).catch(() => BigInt(0)),
    publicClient.readContract({
      address: HOOK_ADDRESS,
      abi: HOOK_ABI,
      functionName: 'totalVolume',
      args: [POOL_ID],
    }).catch(() => BigInt(0)),
  ])

  const recommendation = await recommendFee(analysis)

  return {
    hookAddress: HOOK_ADDRESS,
    poolId: POOL_ID,
    oracleAddress: oracleAddress as string,
    analysis,
    recommendation,
    poolStats: {
      swapCount: swapCount.toString(),
      totalVolume: totalVolume.toString(),
    },
    timestamp: Math.floor(Date.now() / 1000),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFee(fee: number): string {
  return `${(fee / 10000).toFixed(2)}%`
}

function getPegStatusExplanation(status: PegAnalysis['pegStatus']): string {
  switch (status) {
    case 'tight':
      return 'Both stablecoins are tightly pegged to $1.00. Minimal swap risk justifies the lowest fee tier.'
    case 'normal':
      return 'Minor deviation detected but within normal range. Low fee tier recommended.'
    case 'stressed':
      return 'Significant peg deviation detected. Higher fee tier recommended to compensate LPs for impermanent loss risk.'
    case 'depegged':
      return 'WARNING: Major depeg event detected. Maximum fee tier recommended to protect liquidity providers.'
  }
}

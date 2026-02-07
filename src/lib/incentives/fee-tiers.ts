/**
 * ENSIO Fee Tier System
 *
 * Creates lock-in through volume-based discounts:
 * - Higher volume = lower fees
 * - Losing tier = fee increase (switching cost)
 *
 * Yield share aligns protocol with receiver success:
 * - Protocol takes 10% of yield, not principal
 * - Receiver earns more = protocol earns more
 */

export interface FeeTier {
  name: string
  minVolume: number      // USD monthly volume threshold
  maxVolume: number
  feeRate: number        // Basis points (100 = 1%)
  feePercent: string     // Human readable
  savings: string        // vs Starter tier
  color: string          // UI color
}

export const FEE_TIERS: FeeTier[] = [
  {
    name: 'Starter',
    minVolume: 0,
    maxVolume: 1_000,
    feeRate: 15,           // 0.15%
    feePercent: '0.15%',
    savings: '',
    color: '#9C9B93',
  },
  {
    name: 'Growth',
    minVolume: 1_000,
    maxVolume: 10_000,
    feeRate: 10,           // 0.10%
    feePercent: '0.10%',
    savings: '33% off',
    color: '#22C55E',
  },
  {
    name: 'Pro',
    minVolume: 10_000,
    maxVolume: 100_000,
    feeRate: 5,            // 0.05%
    feePercent: '0.05%',
    savings: '67% off',
    color: '#3B82F6',
  },
  {
    name: 'Enterprise',
    minVolume: 100_000,
    maxVolume: Infinity,
    feeRate: 2.5,          // 0.025%
    feePercent: '0.025%',
    savings: '83% off',
    color: '#8B5CF6',
  },
]

// Yield share: protocol takes 10% of yield earned
export const YIELD_SHARE_RATE = 0.10  // 10%

// Gas tank bonus: 0% fee if receiver funds gas tank
export const GAS_TANK_FEE_RATE = 0    // 0%

/**
 * Get fee tier based on monthly volume
 */
export function getFeeTier(monthlyVolumeUsd: number): FeeTier {
  for (let i = FEE_TIERS.length - 1; i >= 0; i--) {
    if (monthlyVolumeUsd >= FEE_TIERS[i].minVolume) {
      return FEE_TIERS[i]
    }
  }
  return FEE_TIERS[0]
}

/**
 * Calculate protocol fee for a payment
 */
export function calculateFee(params: {
  amountUsd: number
  monthlyVolumeUsd: number
  receiverHasGasTank: boolean
  senderAddress?: string
  receiverAddress?: string
  isInternalPayment?: boolean
}): {
  tier: FeeTier
  feeRate: number
  feeAmount: number
  feePercent: string
  reason: string
  isInternal?: boolean
  networkDiscount?: string
} {
  const { amountUsd, monthlyVolumeUsd, receiverHasGasTank, isInternalPayment } = params

  const tier = getFeeTier(monthlyVolumeUsd)

  // Priority 1: Internal payment (receiver-to-receiver) = 0% fee
  if (isInternalPayment) {
    return {
      tier,
      feeRate: 0,
      feeAmount: 0,
      feePercent: '0%',
      reason: 'ENSIO-to-ENSIO (0% fee)',
      isInternal: true,
      networkDiscount: '100%',
    }
  }

  // Priority 2: Gas tank bonus = 0% fee
  if (receiverHasGasTank) {
    return {
      tier,
      feeRate: GAS_TANK_FEE_RATE,
      feeAmount: 0,
      feePercent: '0%',
      reason: 'Gas tank funded - fee waived',
    }
  }

  // Standard tier-based fee
  const feeAmount = (amountUsd * tier.feeRate) / 10_000

  return {
    tier,
    feeRate: tier.feeRate,
    feeAmount,
    feePercent: tier.feePercent,
    reason: `${tier.name} tier`,
  }
}

/**
 * Calculate yield share for protocol
 */
export function calculateYieldShare(params: {
  principalUsd: number
  yieldEarnedUsd: number
}): {
  protocolShare: number
  receiverShare: number
  protocolPercent: string
} {
  const { yieldEarnedUsd } = params
  const protocolShare = yieldEarnedUsd * YIELD_SHARE_RATE
  const receiverShare = yieldEarnedUsd * (1 - YIELD_SHARE_RATE)

  return {
    protocolShare,
    receiverShare,
    protocolPercent: `${YIELD_SHARE_RATE * 100}%`,
  }
}

/**
 * Calculate volume needed for next tier
 */
export function getNextTierInfo(monthlyVolumeUsd: number): {
  currentTier: FeeTier
  nextTier: FeeTier | null
  volumeToNextTier: number
  percentToNextTier: number
} {
  const currentTier = getFeeTier(monthlyVolumeUsd)
  const currentIndex = FEE_TIERS.findIndex(t => t.name === currentTier.name)
  const nextTier = currentIndex < FEE_TIERS.length - 1 ? FEE_TIERS[currentIndex + 1] : null

  if (!nextTier) {
    return {
      currentTier,
      nextTier: null,
      volumeToNextTier: 0,
      percentToNextTier: 100,
    }
  }

  const volumeToNextTier = nextTier.minVolume - monthlyVolumeUsd
  const tierRange = nextTier.minVolume - currentTier.minVolume
  const progress = monthlyVolumeUsd - currentTier.minVolume
  const percentToNextTier = Math.min(100, (progress / tierRange) * 100)

  return {
    currentTier,
    nextTier,
    volumeToNextTier,
    percentToNextTier,
  }
}

/**
 * Format volume for display
 */
export function formatVolume(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}k`
  return `$${usd.toFixed(0)}`
}

/**
 * Network Effects: Receiver-to-Receiver 0% Fee
 *
 * When both sender and receiver are FlowFi users:
 * - 0% protocol fee (internal transfer)
 * - Creates viral loop: more receivers = more free payments
 * - Ecosystem lock-in: leaving = paying fees again
 *
 * This is the missing piece for exponential growth.
 */

// In-memory store of FlowFi receivers (in production, this would be a database)
const flowFiReceivers = new Set<string>([
  // Demo receivers (lowercase)
  'vitalik.eth',
  'flowfi.eth',
  'alice.eth',
  'bob.eth',
  // Addresses
  '0xd8da6bf26964af9d7eed9e03e53415d37aa96045', // vitalik.eth
  '0x999a8dbc672a0da86471e67b9a22ea2b1c91e101', // agent wallet
])

/**
 * Check if an address/ENS is a registered FlowFi receiver
 */
export function isFlowFiReceiver(addressOrEns: string): boolean {
  return flowFiReceivers.has(addressOrEns.toLowerCase())
}

/**
 * Register a new FlowFi receiver
 */
export function registerReceiver(addressOrEns: string): void {
  flowFiReceivers.add(addressOrEns.toLowerCase())
}

/**
 * Get count of FlowFi receivers (for network stats)
 */
export function getReceiverCount(): number {
  return flowFiReceivers.size
}

/**
 * Check if payment qualifies for 0% internal fee
 */
export function isInternalPayment(sender: string, receiver: string): {
  isInternal: boolean
  senderIsReceiver: boolean
  receiverIsReceiver: boolean
  discount: string
} {
  const senderIsReceiver = isFlowFiReceiver(sender)
  const receiverIsReceiver = isFlowFiReceiver(receiver)
  const isInternal = senderIsReceiver && receiverIsReceiver

  return {
    isInternal,
    senderIsReceiver,
    receiverIsReceiver,
    discount: isInternal ? '100%' : senderIsReceiver ? '50%' : '0%',
  }
}

/**
 * Calculate fee with network effects
 */
export function calculateNetworkFee(params: {
  baseFeeRate: number  // From tier system (e.g., 10 = 0.10%)
  sender: string
  receiver: string
  amountUsd: number
}): {
  feeRate: number
  feeAmount: number
  feePercent: string
  isInternal: boolean
  networkDiscount: string
  reason: string
} {
  const { baseFeeRate, sender, receiver, amountUsd } = params
  const internal = isInternalPayment(sender, receiver)

  // Internal payment: 0% fee
  if (internal.isInternal) {
    return {
      feeRate: 0,
      feeAmount: 0,
      feePercent: '0%',
      isInternal: true,
      networkDiscount: '100%',
      reason: 'FlowFi-to-FlowFi payment (0% fee)',
    }
  }

  // Sender is FlowFi receiver: 50% discount
  if (internal.senderIsReceiver) {
    const discountedRate = baseFeeRate / 2
    const feeAmount = (amountUsd * discountedRate) / 10_000
    return {
      feeRate: discountedRate,
      feeAmount,
      feePercent: `${(discountedRate / 100).toFixed(3)}%`,
      isInternal: false,
      networkDiscount: '50%',
      reason: 'FlowFi sender discount (50% off)',
    }
  }

  // Standard fee
  const feeAmount = (amountUsd * baseFeeRate) / 10_000
  return {
    feeRate: baseFeeRate,
    feeAmount,
    feePercent: `${(baseFeeRate / 100).toFixed(2)}%`,
    isInternal: false,
    networkDiscount: '0%',
    reason: 'Standard fee',
  }
}

/**
 * Network growth stats
 */
export function getNetworkStats(): {
  totalReceivers: number
  networkValue: string
  potentialFreePayments: string
} {
  const count = getReceiverCount()
  // Network value = n * (n-1) potential free payment pairs
  const pairs = count * (count - 1)

  return {
    totalReceivers: count,
    networkValue: `${pairs} free payment routes`,
    potentialFreePayments: pairs.toLocaleString(),
  }
}

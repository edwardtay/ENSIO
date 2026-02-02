export type MessageRole = 'user' | 'agent'

export type RouteType = 'standard' | 'composer' | 'contract-call'

export type RouteOption = {
  id: string
  path: string         // e.g. "Base USDC -> Arbitrum USDC"
  fee: string          // e.g. "$0.12"
  estimatedTime: string
  provider: string     // e.g. "LI.FI", "Circle CCTP", "Uniswap v4"
  routeType?: RouteType // categorise route for frontend display
}

export type ParsedIntent = {
  action: 'transfer' | 'swap' | 'deposit' | 'yield' | 'pay_x402'
  amount: string
  fromToken: string
  toToken: string
  toAddress?: string
  toChain?: string
  fromChain?: string
  url?: string         // for x402
  vaultProtocol?: string // e.g. "aave", "morpho" — used for Composer routes
}

/**
 * Result of resolving an ENS name via resolve.ts.
 *
 * Includes the on-chain address plus all PayAgent-specific and standard text
 * records that were readable at resolution time.
 */
export type ENSResolution = {
  address: string | null
  /** com.payagent.chain — receiver's preferred destination chain */
  preferredChain?: string
  /** com.payagent.token — receiver's preferred token */
  preferredToken?: string
  /** com.payagent.slippage — receiver's preferred max slippage (e.g. "0.5" = 0.5 %) */
  preferredSlippage?: string
  /** com.payagent.maxFee — max acceptable fee in USD (e.g. "1.00") */
  maxFee?: string
  /** Standard ENS avatar URL */
  avatar?: string
  /** Standard ENS description */
  description?: string
}

/**
 * Text-record payload for a payment-receipt subname.
 * Used by src/lib/ens/receipts.ts.
 */
export type ReceiptTextRecords = {
  'com.payagent.tx': string
  'com.payagent.amount': string
  'com.payagent.token': string
  'com.payagent.chain': string
  'com.payagent.recipient': string
  'com.payagent.timestamp': string
}

export type Message = {
  id: string
  role: MessageRole
  content: string
  intent?: ParsedIntent
  routes?: RouteOption[]
  txHash?: string
  timestamp: number
  /** ENS profile data when the recipient was resolved from an ENS name */
  ensProfile?: {
    avatar?: string
    description?: string
  }
}

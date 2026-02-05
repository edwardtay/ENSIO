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
  action: 'transfer' | 'swap' | 'deposit' | 'yield' | 'consolidate'
  amount: string
  fromToken: string
  toToken: string
  toAddress?: string
  toChain?: string
  fromChain?: string
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
  /** com.payagent.autoconsolidate — whether to auto-consolidate deposits (e.g. "true") */
  autoConsolidate?: string
  /** Standard ENS avatar URL */
  avatar?: string
  /** Standard ENS description */
  description?: string
  /** yieldroute.vault — ERC-4626 vault address for auto-yield deposits */
  yieldVault?: string
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

export type TokenBalance = {
  symbol: string
  balance: string
  chain: string
  usdValue?: string
}

export type ENSConfig = {
  preferredToken?: string
  preferredChain?: string
  autoConsolidate?: string
}

export type ExecutionState = 'idle' | 'approving' | 'pending' | 'confirmed' | 'error'

export type Message = {
  id: string
  role: MessageRole
  content: string
  intent?: ParsedIntent
  routes?: RouteOption[]
  txHash?: string
  chainId?: number
  timestamp: number
  /** ENS profile data when the recipient was resolved from an ENS name */
  ensProfile?: {
    name?: string
    avatar?: string
    description?: string
    preferredToken?: string
    preferredChain?: string
  }
  /** User's ENS name, used when executing ENS preference writes */
  ensName?: string
}

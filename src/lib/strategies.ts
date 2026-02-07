/**
 * FlowFi Strategy System
 *
 * Allows receivers to set their preferred DeFi strategies via ENS text records.
 * Supports single strategy or multi-strategy allocation.
 *
 * ENS Record Format:
 * - Single: flowfi.strategy = "liquid" or "restaking"
 * - Multi:  flowfi.strategies = "liquid:50,restaking:50"
 *
 * Strategies:
 * - liquid: Keep as liquid USDC (default, no deposit)
 * - restaking: Deposit to Renzo for ezETH restaking (EigenLayer points)
 *
 * Note: yield strategy (vault deposits) is disabled due to LI.FI contract calls bug.
 */

export type StrategyType = 'yield' | 'restaking' | 'liquid'

export interface Strategy {
  id: StrategyType
  name: string
  description: string
  destChain: string
  destChainId: number
  destToken: string
  destTokenAddress: string
  contractAddress: string
  protocol: string
  outputToken?: string
  outputTokenAddress?: string
  gasLimit: string
  color: string // For UI
}

export interface StrategyAllocation {
  strategy: StrategyType
  percentage: number // 0-100
}

// Contract addresses on Base
const YIELD_ROUTER_ADDRESS = '0xE132329262224f5EEd5BCA1ee64768cf437308d8'
const RESTAKING_ROUTER_ADDRESS = '0x31549dB00B180d528f77083b130C0A045D0CF117'
const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const WETH_BASE_ADDRESS = '0x4200000000000000000000000000000000000006'
const EZETH_ADDRESS = '0x2416092f143378750bb29b79eD961ab195CcEea5'

// Default Aave vault on Base
const DEFAULT_YIELD_VAULT = '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB'

export const STRATEGIES: Record<StrategyType, Strategy> = {
  yield: {
    id: 'yield',
    name: 'Yield Vault',
    description: 'Earn yield on USDC via Aave or Morpho',
    destChain: 'base',
    destChainId: 8453,
    destToken: 'USDC',
    destTokenAddress: USDC_BASE_ADDRESS,
    contractAddress: YIELD_ROUTER_ADDRESS,
    protocol: 'Aave v3',
    gasLimit: '300000',
    color: '#22C55E', // Green
  },
  restaking: {
    id: 'restaking',
    name: 'Restaking',
    description: 'Earn EigenLayer points via Renzo ezETH',
    destChain: 'base',
    destChainId: 8453,
    destToken: 'WETH',
    destTokenAddress: WETH_BASE_ADDRESS,
    contractAddress: RESTAKING_ROUTER_ADDRESS,
    protocol: 'Renzo',
    outputToken: 'ezETH',
    outputTokenAddress: EZETH_ADDRESS,
    gasLimit: '350000',
    color: '#7C3AED', // Purple
  },
  liquid: {
    id: 'liquid',
    name: 'Liquid',
    description: 'Keep as USDC in wallet (no deposit)',
    destChain: 'base',
    destChainId: 8453,
    destToken: 'USDC',
    destTokenAddress: USDC_BASE_ADDRESS,
    contractAddress: '', // No contract, direct transfer
    protocol: 'Direct',
    gasLimit: '100000',
    color: '#6B7280', // Gray
  },
}

// Strategy router addresses
export const STRATEGY_ROUTERS = {
  yield: YIELD_ROUTER_ADDRESS,
  restaking: RESTAKING_ROUTER_ADDRESS,
  liquid: '', // No router needed
}

// Renzo xRenzoDeposit ABI (deposit function)
export const RENZO_DEPOSIT_ABI = [
  {
    name: 'deposit',
    type: 'function',
    inputs: [
      { name: '_amountIn', type: 'uint256' },
      { name: '_minOut', type: 'uint256' },
      { name: '_deadline', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
] as const

/**
 * Parse strategy allocation from ENS text record
 *
 * Formats supported:
 * - Single strategy: "yield" or "restaking"
 * - Multi-strategy: "yield:50,restaking:50" or "yield:60,restaking:30,liquid:10"
 */
export function parseStrategyAllocation(
  strategyRecord: string | undefined,
  strategiesRecord: string | undefined
): StrategyAllocation[] {
  // Check multi-strategy record first
  if (strategiesRecord) {
    return parseMultiStrategy(strategiesRecord)
  }

  // Fall back to single strategy
  if (strategyRecord) {
    const normalized = strategyRecord.toLowerCase().trim()
    if (normalized in STRATEGIES) {
      return [{ strategy: normalized as StrategyType, percentage: 100 }]
    }
  }

  // Default to liquid
  return [{ strategy: 'liquid', percentage: 100 }]
}

/**
 * Parse multi-strategy format: "yield:50,restaking:50"
 */
function parseMultiStrategy(record: string): StrategyAllocation[] {
  const allocations: StrategyAllocation[] = []
  const parts = record.split(',').map(p => p.trim())

  for (const part of parts) {
    const [strategyId, percentStr] = part.split(':').map(s => s.trim())
    const normalized = strategyId.toLowerCase()
    const percentage = parseInt(percentStr, 10)

    if (normalized in STRATEGIES && !isNaN(percentage) && percentage > 0) {
      allocations.push({
        strategy: normalized as StrategyType,
        percentage,
      })
    }
  }

  // Validate total is 100
  const total = allocations.reduce((sum, a) => sum + a.percentage, 0)
  if (total !== 100 && allocations.length > 0) {
    // Normalize to 100%
    const factor = 100 / total
    allocations.forEach(a => {
      a.percentage = Math.round(a.percentage * factor)
    })
  }

  // If no valid allocations, default to liquid
  if (allocations.length === 0) {
    return [{ strategy: 'liquid', percentage: 100 }]
  }

  return allocations
}

/**
 * Format strategy allocation for ENS text record
 */
export function formatStrategyAllocation(allocations: StrategyAllocation[]): string {
  if (allocations.length === 0) {
    return 'liquid:100'
  }

  if (allocations.length === 1 && allocations[0].percentage === 100) {
    // Single strategy, use simple format
    return allocations[0].strategy
  }

  // Multi-strategy format
  return allocations
    .filter(a => a.percentage > 0)
    .map(a => `${a.strategy}:${a.percentage}`)
    .join(',')
}

/**
 * Get strategy from single strategy ID (backward compatible)
 */
export function getStrategy(strategyId: string | undefined): Strategy {
  if (!strategyId) return STRATEGIES.liquid
  const normalized = strategyId.toLowerCase().trim()
  if (normalized in STRATEGIES) {
    return STRATEGIES[normalized as StrategyType]
  }
  return STRATEGIES.liquid
}

/**
 * Check if a strategy requires a router contract
 */
export function strategyRequiresRouter(strategy: StrategyType): boolean {
  return strategy === 'restaking'
}

/**
 * Calculate amounts for each strategy based on allocation
 */
export function calculateStrategyAmounts(
  totalAmount: string,
  allocations: StrategyAllocation[]
): { strategy: StrategyType; amount: string }[] {
  const total = parseFloat(totalAmount)

  return allocations.map(a => ({
    strategy: a.strategy,
    amount: ((total * a.percentage) / 100).toFixed(6),
  }))
}

/**
 * Get the contract addresses for strategies
 */
export const STRATEGY_CONTRACTS = {
  yieldRouter: YIELD_ROUTER_ADDRESS,
  restakingRouter: RESTAKING_ROUTER_ADDRESS,
  renzoDeposit: '0xf25484650484DE3d554fB0b7125e7696efA4ab99',
  ezETH: EZETH_ADDRESS,
  wethBase: WETH_BASE_ADDRESS,
  usdcBase: USDC_BASE_ADDRESS,
}

import { keccak256, encodeAbiParameters, type Address } from 'viem'
import type { RouteOption } from '@/lib/types'

// ---------------------------------------------------------------------------
// Token categories
// ---------------------------------------------------------------------------

export type TokenCategory = 'stable' | 'bluechip'

export type V4TokenConfig = {
  address: Address
  decimals: number
  category: TokenCategory
}

export type V4ChainConfig = {
  hook: Address
  mevProtectionHook: Address
  streamingPaymentHook: Address
  smartVaultHook: Address
  feeStrategy: Address // 0.1% protocol fee
  universalRouter: Address
  permit2: Address
  poolManager: Address
  chainId: number
  tokens: Record<string, V4TokenConfig>
}

// ---------------------------------------------------------------------------
// Per-chain V4 configuration
// ---------------------------------------------------------------------------

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

export const V4_CHAINS: Record<string, V4ChainConfig> = {
  base: {
    hook: '0xA5Cb63B540D4334F01346F3D4C51d5B2fFf050c0', // PayAgentHook (dynamic fees)
    mevProtectionHook: '0x57195827De71E3b59744Cf92F7918f539dD8C0C0',
    streamingPaymentHook: '0x7BFbd48de8802890444a39ff25B84e10D577C040',
    smartVaultHook: '0x47b57632bC8D7218773a7f9EF04D2C4B2cBD4040',
    feeStrategy: '0x29Bf3b390f8c8160667Fc277baA58b61F1CC275b', // 0.1% protocol fee
    universalRouter: '0x6ff5693b99212da76ad316178a184ab56d299b43',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    poolManager: '0x498581fF718922c3f8e6A244956aF099B2652b2b',
    chainId: 8453,
    tokens: {
      USDC:  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6,  category: 'stable' },
      USDT:  { address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6,  category: 'stable' },
      DAI:   { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, category: 'stable' },
      WETH:  { address: '0x4200000000000000000000000000000000000006', decimals: 18, category: 'bluechip' },
      cbBTC: { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8,  category: 'bluechip' },
    },
  },
  unichain: {
    hook: '0x2204fc852739D04254d3bc97451f905a458910c0',
    mevProtectionHook: ZERO_ADDRESS, // Not deployed yet
    streamingPaymentHook: ZERO_ADDRESS, // Not deployed yet
    smartVaultHook: ZERO_ADDRESS, // Not deployed yet
    feeStrategy: ZERO_ADDRESS, // Not deployed yet
    universalRouter: '0x0000000000000000000000000000000000000000', // TBD
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
    poolManager: '0x0000000000000000000000000000000000000000', // TBD
    chainId: 1301,
    tokens: {
      USDC: { address: '0x0000000000000000000000000000000000000000', decimals: 6,  category: 'stable' },
      USDT: { address: '0x0000000000000000000000000000000000000000', decimals: 6,  category: 'stable' },
      DAI:  { address: '0x0000000000000000000000000000000000000000', decimals: 18, category: 'stable' },
    },
  },
}

// ---------------------------------------------------------------------------
// Pair classification & defaults
// ---------------------------------------------------------------------------

type PairType = 'stable' | 'bluechip' | 'mixed'

type PairDefaults = {
  pairType: PairType
  feeBps: number        // hundredths of a bip (100 = 0.01%)
  tickSpacing: number
  slippage: number      // fraction, e.g. 0.003 = 0.3%
}

const PAIR_DEFAULTS: Record<PairType, Omit<PairDefaults, 'pairType'>> = {
  stable:   { feeBps: 100,  tickSpacing: 1,  slippage: 0.003 },
  bluechip: { feeBps: 500,  tickSpacing: 60, slippage: 0.02 },
  mixed:    { feeBps: 3000, tickSpacing: 60, slippage: 0.02 },
}

function classifyPair(catA: TokenCategory, catB: TokenCategory): PairType {
  if (catA === 'stable' && catB === 'stable') return 'stable'
  if (catA === 'bluechip' && catB === 'bluechip') return 'bluechip'
  return 'mixed'
}

export function getPairDefaults(
  chain: string,
  fromSymbol: string,
  toSymbol: string,
): PairDefaults | undefined {
  const cfg = V4_CHAINS[chain]
  if (!cfg) return undefined
  const fromTok = cfg.tokens[fromSymbol.toUpperCase()]
  const toTok = cfg.tokens[toSymbol.toUpperCase()]
  if (!fromTok || !toTok) return undefined
  const pairType = classifyPair(fromTok.category, toTok.category)
  return { pairType, ...PAIR_DEFAULTS[pairType] }
}

// ---------------------------------------------------------------------------
// Pool ID computation
// ---------------------------------------------------------------------------

// Dynamic fee flag used on-chain by PayAgentHook
const DYNAMIC_FEE_FLAG = 0x800000

// Minimum pool liquidity (in token units) required to recommend the v4 route
const MIN_POOL_LIQUIDITY = BigInt(1000) // $1,000 minimum

// PAXG (gold token) — Ethereum mainnet only, used for display in consolidation flows
export const PAXG_ADDRESS = '0x45804880De22913dAFE09f4980848ECE6EcbAf78' as const

/**
 * Compute a Uniswap v4 PoolId from PoolKey components.
 * Mirrors PoolIdLibrary.toId(): keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
 */
export function computePoolId(params: {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
}): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address', name: 'currency0' },
        { type: 'address', name: 'currency1' },
        { type: 'uint24', name: 'fee' },
        { type: 'int24', name: 'tickSpacing' },
        { type: 'address', name: 'hooks' },
      ],
      [
        params.currency0,
        params.currency1,
        params.fee,
        params.tickSpacing,
        params.hooks,
      ]
    )
  )
}

/**
 * Sort two token addresses into canonical order (lower address first),
 * matching Uniswap v4's currency0 < currency1 requirement.
 */
function sortTokens(a: Address, b: Address): [Address, Address] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a]
}

/**
 * Format a fee in hundredths-of-a-bip into a human-readable percentage string.
 * e.g., 100 -> "0.01%", 3000 -> "0.30%", 10000 -> "1.00%"
 */
function formatFeePercent(feeBps: number): string {
  return `${(feeBps / 10000).toFixed(2)}%`
}

// ---------------------------------------------------------------------------
// Route finder
// ---------------------------------------------------------------------------

export function findV4Routes(params: {
  fromChain: string
  toChain: string
  fromToken: string
  toToken: string
  amount: string
  poolLiquidity?: bigint
}): RouteOption[] {
  // Only same-chain swaps
  const isSameChain = params.fromChain === params.toChain || !params.toChain
  if (!isSameChain) return []

  const chain = params.fromChain || 'base'
  const cfg = V4_CHAINS[chain]
  if (!cfg) return []

  // Hook must be deployed (non-zero)
  if (cfg.hook === ZERO_ADDRESS) return []

  const fromSymbol = params.fromToken?.toUpperCase()
  const toSymbol = params.toToken?.toUpperCase()
  if (!fromSymbol || !toSymbol || fromSymbol === toSymbol) return []

  const fromTok = cfg.tokens[fromSymbol]
  const toTok = cfg.tokens[toSymbol]
  if (!fromTok || !toTok) return []

  // Both token addresses must be deployed (non-zero)
  if (fromTok.address === ZERO_ADDRESS || toTok.address === ZERO_ADDRESS) return []

  // Validate pool liquidity meets minimum threshold
  if (
    params.poolLiquidity !== undefined &&
    params.poolLiquidity < MIN_POOL_LIQUIDITY
  ) {
    return []
  }

  // Derive pair defaults from token categories
  const pairType = classifyPair(fromTok.category, toTok.category)
  const defaults = PAIR_DEFAULTS[pairType]

  // Compute the pool ID dynamically from the PoolKey
  const [currency0, currency1] = sortTokens(fromTok.address, toTok.address)
  const poolId = computePoolId({
    currency0,
    currency1,
    fee: DYNAMIC_FEE_FLAG,
    tickSpacing: defaults.tickSpacing,
    hooks: cfg.hook,
  })

  return [
    {
      id: `v4-${poolId.slice(0, 18)}`,
      path: `${params.fromToken} -> ${params.toToken} via PayAgentHook (${pairType} fee: ${formatFeePercent(defaults.feeBps)})`,
      fee: `$${(parseFloat(params.amount) * defaults.feeBps / 1_000_000).toFixed(2)}`,
      estimatedTime: '~15s',
      provider: 'Uniswap v4 + PayAgent Dynamic Fee Hook',
      hookData: {
        hookAddress: cfg.hook,
        poolId,
        dynamicFeeBps: defaults.feeBps,
        feeTier: pairType,
        tickSpacing: defaults.tickSpacing,
        oracleManaged: true,
      },
    } as RouteOption & { hookData: Record<string, unknown> },
  ]
}

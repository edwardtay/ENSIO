// ---------------------------------------------------------------------------
// Chainlink Price Feeds - Primary Oracle
// ---------------------------------------------------------------------------

import { createPublicClient, http, parseAbi } from 'viem'
import { base } from 'viem/chains'

const client = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
})

// Chainlink Aggregator V3 ABI (minimal)
const aggregatorV3Abi = parseAbi([
  'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() external view returns (uint8)',
])

// Chainlink Price Feed Addresses on Base Mainnet
// https://docs.chain.link/data-feeds/price-feeds/addresses?network=base
const CHAINLINK_FEEDS: Record<string, `0x${string}`> = {
  'USDC/USD': '0x7e860098F58bBFC8648a4311b374B1D669a2bc6B',
  'ETH/USD': '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
  'USDT/USD': '0xf19d560eB8d2ADf07BD6D13ed03e1D11215721F9',
  'DAI/USD': '0x591e79239a7d679378eC8c847e5038150364C78F',
  'BTC/USD': '0x64c911996D3c6aC71E9b8Ac2c86f3a9e5814e6b6',
  'CBBTC/USD': '0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D',
}

// Map token symbols to feed keys
const SYMBOL_TO_FEED: Record<string, string> = {
  USDC: 'USDC/USD',
  USDT: 'USDT/USD',
  DAI: 'DAI/USD',
  ETH: 'ETH/USD',
  WETH: 'ETH/USD',
  BTC: 'BTC/USD',
  WBTC: 'BTC/USD',
  CBBTC: 'CBBTC/USD',
}

export type PriceResult = {
  price: number
  timestamp: number
  source: 'chainlink' | 'stork' | 'fallback'
  confidence: number
}

/**
 * Fetch price from Chainlink on Base mainnet
 */
export async function getChainlinkPrice(feedKey: string): Promise<PriceResult> {
  const feedAddress = CHAINLINK_FEEDS[feedKey]

  if (!feedAddress) {
    throw new Error(`No Chainlink feed for: ${feedKey}`)
  }

  const [roundData, decimals] = await Promise.all([
    client.readContract({
      address: feedAddress,
      abi: aggregatorV3Abi,
      functionName: 'latestRoundData',
    }),
    client.readContract({
      address: feedAddress,
      abi: aggregatorV3Abi,
      functionName: 'decimals',
    }),
  ])

  const [, answer, , updatedAt] = roundData
  const price = Number(answer) / 10 ** decimals
  const timestamp = Number(updatedAt)

  // Confidence based on freshness (< 1 hour = high)
  const ageSeconds = Math.floor(Date.now() / 1000) - timestamp
  const confidence = ageSeconds < 3600 ? 1.0 : ageSeconds < 86400 ? 0.9 : 0.7

  return {
    price,
    timestamp,
    source: 'chainlink',
    confidence,
  }
}

/**
 * Get price by token symbol (tries Chainlink first)
 */
export async function getChainlinkPriceBySymbol(symbol: string): Promise<PriceResult> {
  const feedKey = SYMBOL_TO_FEED[symbol.toUpperCase()]

  if (!feedKey) {
    throw new Error(`No Chainlink feed mapping for symbol: ${symbol}`)
  }

  return getChainlinkPrice(feedKey)
}

/**
 * Check if Chainlink feed exists for a symbol
 */
export function hasChainlinkFeed(symbol: string): boolean {
  return !!SYMBOL_TO_FEED[symbol.toUpperCase()]
}

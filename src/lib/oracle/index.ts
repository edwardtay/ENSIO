// ---------------------------------------------------------------------------
// Unified Oracle - Chainlink primary, Stork fallback
// ---------------------------------------------------------------------------

import { getChainlinkPriceBySymbol, hasChainlinkFeed, type PriceResult } from './chainlink'
import { getAssetPrice as getStorkAssetPrice } from '../circle/stork'

/**
 * Get price for a token symbol.
 *
 * Priority:
 * 1. Chainlink (on-chain, Base mainnet)
 * 2. Stork (off-chain API)
 * 3. Stablecoin fallback ($1.00)
 */
export async function getPrice(symbol: string): Promise<PriceResult> {
  const upper = symbol.toUpperCase()

  // Try Chainlink first
  if (hasChainlinkFeed(upper)) {
    try {
      const result = await getChainlinkPriceBySymbol(upper)
      console.log(`[Oracle] ${upper} price from Chainlink: $${result.price.toFixed(4)}`)
      return result
    } catch (error) {
      console.warn(`[Oracle] Chainlink failed for ${upper}, trying Stork:`, error)
    }
  }

  // Fallback to Stork
  try {
    const storkResult = await getStorkAssetPrice(upper)
    console.log(`[Oracle] ${upper} price from Stork: $${storkResult.price.toFixed(4)}`)
    return {
      price: storkResult.price,
      timestamp: storkResult.timestamp,
      source: 'stork',
      confidence: storkResult.confidence,
    }
  } catch (error) {
    console.warn(`[Oracle] Stork failed for ${upper}:`, error)
  }

  // Final fallback for stablecoins
  if (isStablecoin(upper)) {
    console.log(`[Oracle] ${upper} using stablecoin fallback: $1.00`)
    return {
      price: 1.0,
      timestamp: Math.floor(Date.now() / 1000),
      source: 'fallback',
      confidence: 0.5,
    }
  }

  throw new Error(`Failed to get price for ${symbol} from any oracle`)
}

/**
 * Get USDC price (should be ~$1.00)
 */
export async function getUSDCPrice(): Promise<PriceResult> {
  return getPrice('USDC')
}

/**
 * Get ETH price
 */
export async function getETHPrice(): Promise<PriceResult> {
  return getPrice('ETH')
}

function isStablecoin(symbol: string): boolean {
  return ['USDC', 'USDT', 'DAI', 'BUSD', 'FRAX'].includes(symbol.toUpperCase())
}

export type { PriceResult }

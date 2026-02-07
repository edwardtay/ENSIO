import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, erc20Abi, type Address, formatUnits } from 'viem'
import { base, mainnet, arbitrum, optimism, polygon, avalanche, bsc, zkSync, linea } from 'viem/chains'

// Cached ETH price (refresh every 5 min)
let cachedEthPrice = 2500
let priceLastFetched = 0
const PRICE_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function getEthPrice(): Promise<number> {
  if (Date.now() - priceLastFetched < PRICE_CACHE_TTL) {
    return cachedEthPrice
  }
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      { next: { revalidate: 300 } }
    )
    const data = await res.json()
    cachedEthPrice = data.ethereum?.usd || 2500
    priceLastFetched = Date.now()
    return cachedEthPrice
  } catch {
    return cachedEthPrice // Fallback to cached/default
  }
}

// LI.FI supported chains with token addresses
const CHAIN_CONFIGS = [
  { id: 8453, name: 'base', chain: base, rpc: process.env.BASE_RPC_URL || 'https://mainnet.base.org' },
  { id: 1, name: 'ethereum', chain: mainnet, rpc: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com' },
  { id: 42161, name: 'arbitrum', chain: arbitrum, rpc: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc' },
  { id: 10, name: 'optimism', chain: optimism, rpc: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io' },
  { id: 137, name: 'polygon', chain: polygon, rpc: 'https://polygon-rpc.com' },
  { id: 43114, name: 'avalanche', chain: avalanche, rpc: 'https://api.avax.network/ext/bc/C/rpc' },
  { id: 56, name: 'bsc', chain: bsc, rpc: 'https://bsc-dataseed.binance.org' },
  { id: 324, name: 'zksync', chain: zkSync, rpc: 'https://mainnet.era.zksync.io' },
  { id: 59144, name: 'linea', chain: linea, rpc: 'https://rpc.linea.build' },
] as const

// Token addresses per chain (USDC, USDT, DAI where available)
const TOKENS: Record<string, Record<string, { address: Address; decimals: number }>> = {
  base: {
    USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    USDT: { address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 },
  },
  ethereum: {
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    DAI: { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
  },
  arbitrum: {
    USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
    USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
  },
  optimism: {
    USDC: { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
    USDT: { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 },
  },
  polygon: {
    USDC: { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
    USDT: { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
  },
  avalanche: {
    USDC: { address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6 },
    USDT: { address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6 },
  },
  bsc: {
    USDC: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
    USDT: { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
  },
  zksync: {
    USDC: { address: '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4', decimals: 6 },
  },
  linea: {
    USDC: { address: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff', decimals: 6 },
  },
}

export type TokenBalance = {
  chain: string
  chainId: number
  token: string
  balance: string
  balanceUSD: number
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')

  if (!address) {
    return NextResponse.json({ error: 'Address required' }, { status: 400 })
  }

  try {
    const balances: TokenBalance[] = []

    const scanPromises = CHAIN_CONFIGS.map(async (chainConfig) => {
      const client = createPublicClient({
        chain: chainConfig.chain,
        transport: http(chainConfig.rpc),
      })

      const chainBalances: TokenBalance[] = []

      // Fetch native ETH balance
      try {
        const ethBalance = await client.getBalance({ address: address as Address })
        if (ethBalance > BigInt(0)) {
          const formatted = formatUnits(ethBalance, 18)
          const ethPrice = await getEthPrice()
          const usdValue = parseFloat(formatted) * ethPrice

          if (usdValue >= 0.01) {
            chainBalances.push({
              chain: chainConfig.name,
              chainId: chainConfig.id,
              token: 'ETH',
              balance: formatted,
              balanceUSD: usdValue,
            })
          }
        }
      } catch {
        // Ignore ETH fetch errors
      }

      // Fetch ERC20 token balances
      const chainTokens = TOKENS[chainConfig.name]
      if (!chainTokens) return chainBalances

      const tokenEntries = Object.entries(chainTokens)
      const results = await Promise.allSettled(
        tokenEntries.map(([, info]) =>
          client.readContract({
            address: info.address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address as Address],
          })
        )
      )

      results.forEach((result, i) => {
        if (result.status === 'fulfilled' && result.value > BigInt(0)) {
          const [symbol, info] = tokenEntries[i]
          const formatted = formatUnits(result.value, info.decimals)
          const usdValue = parseFloat(formatted) // Stablecoins ~$1

          if (usdValue >= 0.01) { // Only show if >= $0.01
            chainBalances.push({
              chain: chainConfig.name,
              chainId: chainConfig.id,
              token: symbol,
              balance: formatted,
              balanceUSD: usdValue,
            })
          }
        }
      })

      return chainBalances
    })

    const allResults = await Promise.all(scanPromises)
    allResults.forEach((chainBalances) => balances.push(...chainBalances))

    // Sort by USD value descending
    balances.sort((a, b) => b.balanceUSD - a.balanceUSD)

    // Include ETH price for frontend calculations
    const ethPrice = await getEthPrice()

    return NextResponse.json({ balances, ethPrice })
  } catch (error) {
    console.error('Balance fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch balances' }, { status: 500 })
  }
}

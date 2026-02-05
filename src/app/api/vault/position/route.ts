import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, parseAbi } from 'viem'
import { base } from 'viem/chains'

const client = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
})

const erc4626Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function asset() view returns (address)',
  'function decimals() view returns (uint8)',
])

// DeFiLlama pool IDs for APY lookup
const VAULT_POOLS: Record<string, string> = {
  '0x4e65fe4dba92790696d040ac24aa414708f5c0ab': 'aave-v3-base-usdc', // Aave USDC on Base
  '0x7bfa7c4f149e7415b73bdedfe609237e29cbf34a': 'morpho-base-usdc',  // Morpho USDC on Base
}

async function fetchApyFromDefiLlama(vaultAddress: string): Promise<number | null> {
  try {
    // Try to get APY from DeFiLlama yields API
    const res = await fetch('https://yields.llama.fi/pools', {
      next: { revalidate: 300 }, // Cache for 5 minutes
    })

    if (!res.ok) return null

    const data = await res.json()
    const poolId = VAULT_POOLS[vaultAddress.toLowerCase()]

    if (!poolId) return null

    // Search for matching pool
    const pool = data.data?.find((p: { pool: string; apy: number }) =>
      p.pool.toLowerCase().includes(poolId.toLowerCase()) ||
      p.pool.toLowerCase().includes(vaultAddress.toLowerCase())
    )

    return pool?.apy ?? null
  } catch {
    return null
  }
}

// Fallback: estimate APY from known protocols
const FALLBACK_APY: Record<string, number> = {
  '0x4e65fe4dba92790696d040ac24aa414708f5c0ab': 4.2,  // Aave USDC
  '0x7bfa7c4f149e7415b73bdedfe609237e29cbf34a': 5.1,  // Morpho USDC
}

export async function GET(req: NextRequest) {
  const userAddress = req.nextUrl.searchParams.get('user')
  const vaultAddress = req.nextUrl.searchParams.get('vault')

  if (!userAddress || !vaultAddress) {
    return NextResponse.json(
      { error: 'Missing user or vault parameter' },
      { status: 400 }
    )
  }

  try {
    // Fetch on-chain data in parallel
    const [shares, decimals] = await Promise.all([
      client.readContract({
        address: vaultAddress as `0x${string}`,
        abi: erc4626Abi,
        functionName: 'balanceOf',
        args: [userAddress as `0x${string}`],
      }),
      client.readContract({
        address: vaultAddress as `0x${string}`,
        abi: erc4626Abi,
        functionName: 'decimals',
      }),
    ])

    let assets = BigInt(0)
    if (shares > BigInt(0)) {
      assets = await client.readContract({
        address: vaultAddress as `0x${string}`,
        abi: erc4626Abi,
        functionName: 'convertToAssets',
        args: [shares],
      })
    }

    // Convert to human-readable
    const divisor = BigInt(10 ** decimals)
    const assetsFormatted = Number(assets) / Number(divisor)
    const sharesFormatted = Number(shares) / Number(divisor)

    // Fetch APY (try DeFiLlama, fallback to hardcoded)
    let apy = await fetchApyFromDefiLlama(vaultAddress)
    if (apy === null) {
      apy = FALLBACK_APY[vaultAddress.toLowerCase()] ?? 0
    }

    // Estimate yield earned (simplified: assume linear accrual)
    // In reality would need to track deposits over time
    const yieldEarned = assetsFormatted > sharesFormatted
      ? assetsFormatted - sharesFormatted
      : 0

    return NextResponse.json({
      shares: sharesFormatted.toFixed(2),
      assets: assetsFormatted.toFixed(2),
      apy: apy.toFixed(1),
      earned: yieldEarned.toFixed(2),
    })
  } catch (error) {
    console.error('Vault position error:', error)

    // Return zeros on error (vault may not exist or user has no position)
    return NextResponse.json({
      shares: '0.00',
      assets: '0.00',
      apy: FALLBACK_APY[vaultAddress.toLowerCase()]?.toFixed(1) ?? '0.0',
      earned: '0.00',
    })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, encodeFunctionData, type Address, parseUnits, type Chain } from 'viem'
import { base, mainnet, arbitrum, optimism, polygon, avalanche, bsc, zkSync, linea } from 'viem/chains'

// Chain configs
const CHAIN_CONFIGS: Record<string, { chain: Chain; rpc: string }> = {
  base: { chain: base, rpc: process.env.BASE_RPC_URL || 'https://mainnet.base.org' },
  ethereum: { chain: mainnet, rpc: process.env.ETH_RPC_URL || 'https://eth.llamarpc.com' },
  arbitrum: { chain: arbitrum, rpc: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc' },
  optimism: { chain: optimism, rpc: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io' },
  polygon: { chain: polygon, rpc: 'https://polygon-rpc.com' },
  avalanche: { chain: avalanche, rpc: 'https://api.avax.network/ext/bc/C/rpc' },
  bsc: { chain: bsc, rpc: 'https://bsc-dataseed.binance.org' },
  zksync: { chain: zkSync, rpc: 'https://mainnet.era.zksync.io' },
  linea: { chain: linea, rpc: 'https://rpc.linea.build' },
}

// Token addresses per chain
const TOKEN_ADDRESSES: Record<string, Record<string, { address: Address; decimals: number }>> = {
  base: {
    USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    USDT: { address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 },
    DAI: { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18 },
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

// LI.FI Diamond contract (spender for LI.FI routes)
const LIFI_DIAMOND: Record<string, Address> = {
  base: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  ethereum: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  arbitrum: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  optimism: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  polygon: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  avalanche: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  bsc: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  zksync: '0x341e94069f53234fE6DabeF707aD424830525715',
  linea: '0xDE1E598b81620773454588B85D6b5D4eEC32573e',
}

const erc20Abi = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

/**
 * POST /api/approval/check - Check if token approval is needed and return approval tx data
 */
export async function POST(req: NextRequest) {
  try {
    const { token, chain, owner, spender, amount } = await req.json()

    if (!token || !chain || !owner || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: token, chain, owner, amount' },
        { status: 400 }
      )
    }

    // ETH doesn't need approval
    if (token.toUpperCase() === 'ETH') {
      return NextResponse.json({ needsApproval: false })
    }

    const chainConfig = CHAIN_CONFIGS[chain.toLowerCase()]
    if (!chainConfig) {
      return NextResponse.json({ error: `Unsupported chain: ${chain}` }, { status: 400 })
    }

    const tokenInfo = TOKEN_ADDRESSES[chain.toLowerCase()]?.[token.toUpperCase()]
    if (!tokenInfo) {
      return NextResponse.json({ error: `Token ${token} not supported on ${chain}` }, { status: 400 })
    }

    // Determine spender - use LI.FI Diamond if not specified
    const spenderAddress = spender || LIFI_DIAMOND[chain.toLowerCase()]
    if (!spenderAddress) {
      return NextResponse.json({ error: `No spender configured for ${chain}` }, { status: 400 })
    }

    const client = createPublicClient({
      chain: chainConfig.chain,
      transport: http(chainConfig.rpc),
    })

    // Check current allowance
    const currentAllowance = await client.readContract({
      address: tokenInfo.address,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner as Address, spenderAddress as Address],
    })

    const requiredAmount = parseUnits(amount.toString(), tokenInfo.decimals)

    if (currentAllowance >= requiredAmount) {
      return NextResponse.json({ needsApproval: false })
    }

    // Build approval transaction data (approve max uint256 for convenience)
    const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
    const approvalData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spenderAddress as Address, maxUint256],
    })

    return NextResponse.json({
      needsApproval: true,
      tokenAddress: tokenInfo.address,
      spender: spenderAddress,
      approvalData,
      currentAllowance: currentAllowance.toString(),
      requiredAmount: requiredAmount.toString(),
    })
  } catch (error) {
    console.error('Approval check error:', error)
    const message = error instanceof Error ? error.message : 'Failed to check approval'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { createConfig, getQuote } from '@lifi/sdk'
import {
  createPublicClient,
  encodeFunctionData,
  encodePacked,
  encodeAbiParameters,
  http,
  type Address,
  type Chain,
} from 'viem'
import { base } from 'viem/chains'
import { unichainSepolia } from 'viem/chains'
import type { ParsedIntent, RouteType } from '@/lib/types'
import {
  CHAIN_MAP,
  getTokenAddress,
  getTokenDecimals,
  getPreferredChainForToken,
  getVaultTokenAddress,
  isVaultToken,
} from './tokens'
import { V4_CHAINS, getPairDefaults } from './v4-router'

// CCTP supported chains (for reference - CCTP path disabled for now)
const CIRCLE_CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  arbitrum: 42161,
  base: 8453,
  optimism: 10,
}

// Ensure LI.FI SDK is configured
createConfig({ integrator: 'payagent' })

// ---------------------------------------------------------------------------
// Uniswap v4 shared constants (command & action bytes)
// ---------------------------------------------------------------------------

const V4_CMD = {
  V4_SWAP: 0x10,
  SWAP_EXACT_IN_SINGLE: 0x06,
  SETTLE_ALL: 0x0c,
  TAKE_ALL: 0x0f,
  DYNAMIC_FEE_FLAG: 0x800000,
} as const

const VIEM_CHAINS: Record<string, Chain> = {
  base,
  unichain: unichainSepolia,
}

const ERC20_ABI = [
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

const PERMIT2_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
] as const

const UNIVERSAL_ROUTER_ABI = [
  {
    name: 'execute',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

function getViemClient(chainName: string) {
  const chain = VIEM_CHAINS[chainName] ?? base
  return createPublicClient({ chain, transport: http() })
}

// ---------------------------------------------------------------------------
// V4 approval checking
// ---------------------------------------------------------------------------

async function checkV4Approvals(
  fromAddress: Address,
  tokenAddress: Address,
  amount: bigint,
  chainName: string,
): Promise<'approve-token' | 'approve-permit2' | 'ready'> {
  const chainCfg = V4_CHAINS[chainName]
  if (!chainCfg) throw new Error(`No V4 config for chain: ${chainName}`)
  const client = getViemClient(chainName)

  // 1. Check ERC20 allowance to Permit2
  const tokenAllowance = await client.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [fromAddress, chainCfg.permit2 as Address],
  })

  if ((tokenAllowance as bigint) < amount) {
    return 'approve-token'
  }

  // 2. Check Permit2 allowance to Universal Router
  const [permit2Amount, expiration] = await client.readContract({
    address: chainCfg.permit2 as Address,
    abi: PERMIT2_ABI,
    functionName: 'allowance',
    args: [fromAddress, tokenAddress, chainCfg.universalRouter as Address],
  }) as [bigint, number, number]

  const now = Math.floor(Date.now() / 1000)
  if (permit2Amount < amount || expiration < now) {
    return 'approve-permit2'
  }

  return 'ready'
}

// ---------------------------------------------------------------------------
// V4 transaction builder
// ---------------------------------------------------------------------------

async function getV4TransactionData(
  intent: ParsedIntent,
  fromAddress: string
): Promise<TransactionData> {
  const fromToken = intent.fromToken.toUpperCase()
  const toToken = intent.toToken.toUpperCase()
  const chainName = intent.fromChain || 'base'

  const chainCfg = V4_CHAINS[chainName]
  if (!chainCfg) throw new Error(`No V4 config for chain: ${chainName}`)

  const fromTok = chainCfg.tokens[fromToken]
  const toTok = chainCfg.tokens[toToken]
  if (!fromTok || !toTok) {
    throw new Error(`V4 hook does not support ${fromToken}/${toToken} on ${chainName}`)
  }

  const fromAddr = fromTok.address
  const toAddr = toTok.address
  const decimals = fromTok.decimals

  const defaults = getPairDefaults(chainName, fromToken, toToken)
  if (!defaults) {
    throw new Error(`Cannot derive pair defaults for ${fromToken}/${toToken} on ${chainName}`)
  }

  const amountIn = BigInt(Math.floor(parseFloat(intent.amount) * 10 ** decimals))

  // Check approvals
  const approvalStatus = await checkV4Approvals(
    fromAddress as Address,
    fromAddr,
    amountIn,
    chainName,
  )

  // Step 1: ERC20 approve Permit2
  if (approvalStatus === 'approve-token') {
    const maxApproval = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
    const calldata = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [chainCfg.permit2 as Address, maxApproval],
    })
    return {
      to: fromAddr,
      data: calldata,
      value: '0',
      chainId: chainCfg.chainId,
      provider: 'Approval: Token → Permit2',
      routeType: 'standard',
    }
  }

  // Step 2: Permit2 approve Universal Router
  if (approvalStatus === 'approve-permit2') {
    const maxAmount = BigInt('0xffffffffffffffffffffffffffffffffffffffff') // uint160 max
    const farFuture = 281474976710655 // uint48 max (~8900 years)
    const calldata = encodeFunctionData({
      abi: PERMIT2_ABI,
      functionName: 'approve',
      args: [fromAddr, chainCfg.universalRouter as Address, maxAmount, farFuture],
    })
    return {
      to: chainCfg.permit2,
      data: calldata,
      value: '0',
      chainId: chainCfg.chainId,
      provider: 'Approval: Permit2 → Universal Router',
      routeType: 'standard',
    }
  }

  // Step 3: Build the actual swap via Universal Router
  const zeroForOne = BigInt(fromAddr) < BigInt(toAddr)
  const [currency0, currency1] = zeroForOne
    ? [fromAddr, toAddr]
    : [toAddr, fromAddr]

  // Slippage from pair defaults (e.g. 0.003 for stables, 0.02 for bluechip/mixed)
  const slippageBps = BigInt(Math.floor(defaults.slippage * 1000))
  const minOut = amountIn * (BigInt(1000) - slippageBps) / BigInt(1000)

  // Encode actions: SWAP_EXACT_IN_SINGLE + SETTLE_ALL + TAKE_ALL
  const actions = encodePacked(
    ['uint8', 'uint8', 'uint8'],
    [V4_CMD.SWAP_EXACT_IN_SINGLE, V4_CMD.SETTLE_ALL, V4_CMD.TAKE_ALL]
  )

  const param0 = encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          {
            type: 'tuple',
            name: 'poolKey',
            components: [
              { type: 'address', name: 'currency0' },
              { type: 'address', name: 'currency1' },
              { type: 'uint24', name: 'fee' },
              { type: 'int24', name: 'tickSpacing' },
              { type: 'address', name: 'hooks' },
            ],
          },
          { type: 'bool', name: 'zeroForOne' },
          { type: 'uint128', name: 'amountIn' },
          { type: 'uint128', name: 'minAmountOut' },
          { type: 'bytes', name: 'hookData' },
        ],
      },
    ],
    [
      {
        poolKey: {
          currency0,
          currency1,
          fee: V4_CMD.DYNAMIC_FEE_FLAG,
          tickSpacing: defaults.tickSpacing,
          hooks: chainCfg.hook,
        },
        zeroForOne,
        amountIn,
        minAmountOut: minOut,
        hookData: '0x' as `0x${string}`,
      },
    ]
  )

  // Param 1: SETTLE_ALL(currency, maxAmount)
  const param1 = encodeAbiParameters(
    [
      { type: 'address', name: 'currency' },
      { type: 'uint128', name: 'maxAmount' },
    ],
    [fromAddr, amountIn]
  )

  // Param 2: TAKE_ALL(currency, minAmount)
  const param2 = encodeAbiParameters(
    [
      { type: 'address', name: 'currency' },
      { type: 'uint128', name: 'minAmount' },
    ],
    [toAddr, minOut]
  )

  // Wrap into v4Input: abi.encode(bytes actions, bytes[] params)
  const v4Input = encodeAbiParameters(
    [
      { type: 'bytes', name: 'actions' },
      { type: 'bytes[]', name: 'params' },
    ],
    [actions, [param0, param1, param2]]
  )

  // Build the Universal Router execute() calldata
  const commands = encodePacked(['uint8'], [V4_CMD.V4_SWAP])
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800) // 30 minutes

  const calldata = encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: 'execute',
    args: [commands, [v4Input], deadline],
  })

  return {
    to: chainCfg.universalRouter,
    data: calldata,
    value: '0',
    chainId: chainCfg.chainId,
    provider: 'Uniswap v4 + PayAgent Hook',
    routeType: 'standard',
  }
}

export type TransactionData = {
  to: string
  data: string
  value: string
  chainId: number
  gasLimit?: string
  /** When set, indicates the route provider that produced this tx */
  provider?: string
  /** Indicates the type of route this transaction was built from */
  routeType: RouteType
}

// ---------------------------------------------------------------------------
// Internal: resolve token addresses and amounts shared by both paths
// ---------------------------------------------------------------------------

function resolveParams(intent: ParsedIntent) {
  const fromChainId =
    CHAIN_MAP[intent.fromChain || 'ethereum'] || CHAIN_MAP.ethereum
  let toChainId =
    CHAIN_MAP[intent.toChain || intent.fromChain || 'ethereum'] || fromChainId

  // Auto-resolve destination chain if toToken isn't available there
  if (intent.toToken && !getTokenAddress(intent.toToken, toChainId)) {
    const bestChainId = getPreferredChainForToken(intent.toToken)
    if (bestChainId) {
      toChainId = bestChainId
    }
  }

  const fromTokenAddr = getTokenAddress(intent.fromToken, fromChainId)

  const decimals = getTokenDecimals(intent.fromToken)
  const amountWei = BigInt(
    Math.floor(parseFloat(intent.amount) * 10 ** decimals)
  ).toString()

  return { fromChainId, toChainId, fromTokenAddr, decimals, amountWei }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Given a parsed intent and the user's wallet address, fetches transaction
 * data ready for signing.
 *
 * If the intent is a cross-chain USDC transfer eligible for Circle CCTP,
 * the Circle Bridge Kit path is used. Otherwise LI.FI is the fallback.
 *
 * An optional `provider` hint can force a specific execution path:
 *   - "Circle CCTP" -> always use the CCTP bridge
 *   - anything else  -> use LI.FI
 */
export async function getTransactionData(
  intent: ParsedIntent,
  fromAddress: string,
  slippage?: number,
  provider?: string
): Promise<TransactionData> {
  // ------------------------------------------------------------------
  // Uniswap v4 + PayAgent Hook path
  // ------------------------------------------------------------------
  if (provider?.includes('Uniswap v4')) {
    return getV4TransactionData(intent, fromAddress)
  }

  // ------------------------------------------------------------------
  // Circle CCTP path
  // ------------------------------------------------------------------
  if (provider === 'Circle CCTP' || await shouldUseCCTP(intent)) {
    return getCCTPTransactionData(intent, fromAddress)
  }

  // ------------------------------------------------------------------
  // Default: LI.FI path
  // ------------------------------------------------------------------
  return getLiFiTransactionData(intent, fromAddress, slippage)
}

// ---------------------------------------------------------------------------
// Circle CCTP execution
// ---------------------------------------------------------------------------

/**
 * Determine if an intent should be routed through Circle CCTP.
 * CCTP path is disabled - using LI.FI for all cross-chain routing.
 */
async function shouldUseCCTP(_intent: ParsedIntent): Promise<boolean> {
  // CCTP path disabled for hackathon - LI.FI handles cross-chain routing
  return false
}

/**
 * Build transaction data for a Circle CCTP bridge transfer.
 *
 * In production this would call the Bridge Kit SDK to get the exact
 * calldata for the CCTP MessageTransmitter contract. For now we return
 * the essential fields so the frontend can construct the transaction.
 */
async function getCCTPTransactionData(
  intent: ParsedIntent,
  fromAddress: string
): Promise<TransactionData> {
  const fromChain = intent.fromChain?.toLowerCase() ?? 'ethereum'
  const toChain = intent.toChain?.toLowerCase() ?? 'ethereum'

  const fromChainId = CHAIN_MAP[fromChain] || CHAIN_MAP.ethereum
  const fromTokenAddr = getTokenAddress('USDC', fromChainId)

  if (!fromTokenAddr) {
    throw new Error(`USDC not available on ${fromChain}`)
  }

  const decimals = getTokenDecimals('USDC')
  const amountWei = BigInt(
    Math.floor(parseFloat(intent.amount) * 10 ** decimals)
  ).toString()

  // CCTP V2 TokenMessenger contract addresses per chain
  const TOKEN_MESSENGER: Record<string, string> = {
    ethereum: '0xBd3fa81B58Ba92a82136038B25aDec7066af3155',
    arbitrum: '0x19330d10D9Cc8751218eaf51E8885D058642E08A',
    base: '0x1682Ae6375C4E4A97e4B583BC394c861A46D8962',
    optimism: '0x2B4069517957735bE00ceE0fadAE88a26365528f',
  }

  // CCTP V2 destination domain identifiers
  const CCTP_DOMAINS: Record<string, number> = {
    ethereum: 0,
    arbitrum: 3,
    base: 6,
    optimism: 2,
  }

  const tokenMessenger = TOKEN_MESSENGER[fromChain]
  if (!tokenMessenger) {
    throw new Error(`No CCTP TokenMessenger for chain: ${fromChain}`)
  }

  const destinationDomain = CCTP_DOMAINS[toChain]
  if (destinationDomain === undefined) {
    throw new Error(`No CCTP domain for destination chain: ${toChain}`)
  }

  // Encode the depositForBurn call
  // depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken)
  const { encodeFunctionData } = await import('viem')
  const calldata = encodeFunctionData({
    abi: [
      {
        name: 'depositForBurn',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'amount', type: 'uint256' },
          { name: 'destinationDomain', type: 'uint32' },
          { name: 'mintRecipient', type: 'bytes32' },
          { name: 'burnToken', type: 'address' },
        ],
        outputs: [{ name: 'nonce', type: 'uint64' }],
      },
    ],
    functionName: 'depositForBurn',
    args: [
      BigInt(amountWei),
      destinationDomain,
      // Pad the recipient address to bytes32
      `0x000000000000000000000000${(intent.toAddress || fromAddress).slice(2)}` as `0x${string}`,
      fromTokenAddr as `0x${string}`,
    ],
  })

  return {
    to: tokenMessenger,
    data: calldata,
    value: '0',
    chainId: fromChainId,
    provider: 'Circle CCTP',
    routeType: 'standard',
  }
}

// ---------------------------------------------------------------------------
// LI.FI execution (original path)
// ---------------------------------------------------------------------------

/**
 * Given a parsed intent and the user's wallet address, fetches a quote from
 * LI.FI that includes the transaction calldata ready for signing.
 *
 * Automatically detects whether the intent targets a vault (Composer) or a
 * standard transfer/swap and builds the appropriate quote request.
 */
async function getLiFiTransactionData(
  intent: ParsedIntent,
  fromAddress: string,
  slippage?: number
): Promise<TransactionData> {
  const isComposerIntent =
    intent.action === 'deposit' || intent.action === 'yield'

  if (isComposerIntent) {
    return getComposerTransactionData(intent, fromAddress, slippage)
  }

  return getStandardTransactionData(intent, fromAddress, slippage)
}

// ---------------------------------------------------------------------------
// Standard transfer / swap execution
// ---------------------------------------------------------------------------

async function getStandardTransactionData(
  intent: ParsedIntent,
  fromAddress: string,
  slippage?: number
): Promise<TransactionData> {
  const { fromChainId, toChainId, fromTokenAddr, amountWei } =
    resolveParams(intent)

  const toTokenAddr = getTokenAddress(intent.toToken, toChainId)

  if (!fromTokenAddr || !toTokenAddr) {
    throw new Error(
      `Unsupported token: ${intent.fromToken} or ${intent.toToken}`
    )
  }

  const quote = await getQuote({
    fromChain: fromChainId,
    fromToken: fromTokenAddr,
    fromAddress,
    fromAmount: amountWei,
    toChain: toChainId,
    toToken: toTokenAddr,
    toAddress: intent.toAddress || fromAddress,
    slippage: slippage || 0.005,
  })

  const txRequest = quote.transactionRequest
  if (!txRequest?.to || !txRequest?.data) {
    throw new Error('No transaction data returned from LI.FI quote')
  }

  // Detect if this quote resolved to a Composer route even though the intent
  // was a plain swap (e.g. user swapped to a vault token directly).
  const detectedRouteType: RouteType =
    toTokenAddr && isVaultToken(toTokenAddr) ? 'composer' : 'standard'

  return {
    to: txRequest.to,
    data: txRequest.data,
    value: txRequest.value?.toString() || '0',
    chainId: txRequest.chainId || fromChainId,
    gasLimit: txRequest.gasLimit?.toString(),
    provider: 'LI.FI',
    routeType: detectedRouteType,
  }
}

// ---------------------------------------------------------------------------
// Composer execution — vault deposit / yield
// ---------------------------------------------------------------------------

async function getComposerTransactionData(
  intent: ParsedIntent,
  fromAddress: string,
  slippage?: number
): Promise<TransactionData> {
  const { fromChainId, toChainId, fromTokenAddr, amountWei } =
    resolveParams(intent)

  if (!fromTokenAddr) {
    throw new Error(`Unsupported source token: ${intent.fromToken}`)
  }

  // Determine the vault protocol — default to "aave" when not specified
  const vaultProtocol = intent.vaultProtocol || 'aave'

  // Resolve vault token on the destination chain
  const vaultTokenAddr = getVaultTokenAddress(
    vaultProtocol,
    intent.fromToken,
    toChainId
  )

  if (!vaultTokenAddr) {
    throw new Error(
      `No ${vaultProtocol} vault found for ${intent.fromToken} on chain ${toChainId}`
    )
  }

  // Composer routes use the standard getQuote endpoint — the vault token
  // address as `toToken` triggers the Composer multi-step workflow on the
  // LI.FI backend.
  const quote = await getQuote({
    fromChain: fromChainId,
    fromToken: fromTokenAddr,
    fromAddress,
    fromAmount: amountWei,
    toChain: toChainId,
    toToken: vaultTokenAddr,
    toAddress: fromAddress,
    slippage: slippage || 0.005,
  })

  const txRequest = quote.transactionRequest
  if (!txRequest?.to || !txRequest?.data) {
    throw new Error(
      'No transaction data returned from LI.FI Composer quote'
    )
  }

  // Composer routes may include additional approval steps or multi-call data.
  // The transaction structure itself is the same EVM tx — the difference is
  // that the `to` address is the Composer VM contract rather than a bridge.
  return {
    to: txRequest.to,
    data: txRequest.data,
    value: txRequest.value?.toString() || '0',
    chainId: txRequest.chainId || fromChainId,
    gasLimit: txRequest.gasLimit?.toString(),
    provider: 'LI.FI',
    routeType: 'composer',
  }
}

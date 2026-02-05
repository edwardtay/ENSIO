import { NextRequest, NextResponse } from 'next/server'
import { encodeFunctionData } from 'viem'
import { getTransactionData } from '@/lib/routing/execute-route'
import { buildSetPreferenceTransaction } from '@/lib/ens/write'
import { getTokenAddress, getTokenDecimals, CHAIN_MAP } from '@/lib/routing/tokens'
import { getYieldRouteQuote } from '@/lib/routing/yield-router'
import type { ParsedIntent } from '@/lib/types'

const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { routeId, fromAddress, intent, slippage, ensName, yieldVault, recipient } = body as {
      routeId: string
      fromAddress: string
      intent: ParsedIntent
      slippage?: number
      ensName?: string
      yieldVault?: string
      recipient?: string
    }

    // ENS preference write — returns resolver multicall tx directly
    if (routeId === 'ens-preference') {
      if (!ensName) {
        return NextResponse.json(
          { error: 'Missing ensName for ENS preference write' },
          { status: 400 },
        )
      }
      const txData = await buildSetPreferenceTransaction(
        ensName,
        intent?.toToken || 'USDC',
        intent?.toChain || 'base',
      )
      return NextResponse.json(txData)
    }

    // Direct transfer — same token, same chain, to different recipient
    if (routeId === 'direct-transfer') {
      if (!intent?.toAddress || !intent?.amount || !intent?.fromToken) {
        return NextResponse.json(
          { error: 'Missing toAddress, amount, or fromToken for direct transfer' },
          { status: 400 },
        )
      }

      const chainId = CHAIN_MAP[intent.fromChain || 'base'] || CHAIN_MAP.base
      const tokenAddress = getTokenAddress(intent.fromToken, chainId)
      const decimals = getTokenDecimals(intent.fromToken)

      if (!tokenAddress) {
        return NextResponse.json(
          { error: `Token ${intent.fromToken} not supported on ${intent.fromChain}` },
          { status: 400 },
        )
      }

      const amountWei = BigInt(Math.floor(parseFloat(intent.amount) * 10 ** decimals))

      const calldata = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [intent.toAddress as `0x${string}`, amountWei],
      })

      return NextResponse.json({
        to: tokenAddress,
        data: calldata,
        value: '0',
        chainId,
        provider: 'Direct Transfer',
        routeType: 'standard',
      })
    }

    // Yield route — LI.FI Contract Calls with atomic vault deposit
    if (routeId?.startsWith('yield-route')) {
      if (!yieldVault || !recipient || !intent?.fromToken || !intent?.amount) {
        return NextResponse.json(
          { error: 'Missing yieldVault, recipient, fromToken, or amount for yield route' },
          { status: 400 },
        )
      }

      const yieldResult = await getYieldRouteQuote({
        fromAddress,
        fromChain: intent.fromChain || 'ethereum',
        fromToken: intent.fromToken,
        amount: intent.amount,
        recipient,
        vault: yieldVault,
        slippage,
      })

      if ('error' in yieldResult) {
        return NextResponse.json(
          { error: yieldResult.error },
          { status: 400 },
        )
      }

      const txRequest = yieldResult.quote.transactionRequest
      if (!txRequest) {
        return NextResponse.json(
          { error: 'No transaction request in yield quote' },
          { status: 500 },
        )
      }

      return NextResponse.json({
        to: txRequest.to,
        data: txRequest.data,
        value: txRequest.value?.toString() || '0',
        chainId: txRequest.chainId,
        provider: 'LI.FI + YieldRouter',
        routeType: 'contract-call',
      })
    }

    // Detect v4 route and pass provider hint
    const provider = routeId?.startsWith('v4-') ? 'Uniswap v4' : undefined

    if (!fromAddress || !intent) {
      return NextResponse.json(
        { error: 'Missing fromAddress or intent' },
        { status: 400 }
      )
    }

    // Deposit/yield intents resolve the vault token internally, so toToken
    // is not required for those actions.
    const isComposerAction =
      intent.action === 'deposit' || intent.action === 'yield'

    if (!intent.fromToken || !intent.amount) {
      return NextResponse.json(
        { error: 'Incomplete intent: fromToken and amount required' },
        { status: 400 }
      )
    }

    if (!isComposerAction && !intent.toToken) {
      return NextResponse.json(
        { error: 'Incomplete intent: toToken required for transfer/swap' },
        { status: 400 }
      )
    }

    const txData = await getTransactionData(intent, fromAddress, slippage, provider)

    return NextResponse.json(txData)
  } catch (error: unknown) {
    console.error('Execute API error:', error)
    const message =
      error instanceof Error ? error.message : 'Failed to prepare transaction'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useSendTransaction, useSwitchChain } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ENSResolution, RouteOption } from '@/lib/types'

interface Props {
  ensName: string
}

const SUPPORTED_TOKENS = ['USDC', 'USDT', 'DAI', 'ETH'] as const
const SUPPORTED_CHAINS = [
  { id: 'ethereum', name: 'Ethereum', chainId: 1 },
  { id: 'base', name: 'Base', chainId: 8453 },
  { id: 'arbitrum', name: 'Arbitrum', chainId: 42161 },
  { id: 'optimism', name: 'Optimism', chainId: 10 },
] as const

type ExecutionState = 'idle' | 'quoting' | 'approving' | 'pending' | 'confirmed' | 'error'

export function PaymentFlow({ ensName }: Props) {
  const { address, isConnected, chainId: walletChainId } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const { switchChainAsync } = useSwitchChain()

  const [amount, setAmount] = useState('')
  const [selectedToken, setSelectedToken] = useState<string>('USDC')
  const [selectedChain, setSelectedChain] = useState<string>('base')
  const [recipientInfo, setRecipientInfo] = useState<ENSResolution | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Quote state
  const [quote, setQuote] = useState<RouteOption | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  // Execution state
  const [executionState, setExecutionState] = useState<ExecutionState>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)

  // Fetch recipient ENS info
  useEffect(() => {
    async function fetchRecipient() {
      try {
        const res = await fetch(`/api/ens/resolve?name=${encodeURIComponent(ensName)}`)
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to resolve ENS')
        }
        const data = await res.json()
        setRecipientInfo(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load recipient')
      } finally {
        setLoading(false)
      }
    }
    fetchRecipient()
  }, [ensName])

  // Fetch quote when amount/token/chain changes
  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0 || !recipientInfo?.address || !address) {
      setQuote(null)
      setQuoteError(null)
      return
    }

    const controller = new AbortController()
    let cancelled = false

    async function fetchQuote() {
      setExecutionState('quoting')
      setQuoteError(null)

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `send ${amount} ${selectedToken} to ${ensName} on base`,
            userAddress: address,
            slippage: 0.005,
          }),
          signal: controller.signal,
        })

        if (cancelled) return

        if (!res.ok) {
          throw new Error('Failed to get quote')
        }

        const data = await res.json()
        if (data.routes && data.routes.length > 0) {
          setQuote(data.routes[0])
        } else {
          setQuoteError('No routes available')
        }
      } catch (e) {
        if (!cancelled && e instanceof Error && e.name !== 'AbortError') {
          setQuoteError(e.message)
        }
      } finally {
        if (!cancelled) {
          setExecutionState('idle')
        }
      }
    }

    const debounce = setTimeout(fetchQuote, 500)

    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(debounce)
    }
  }, [amount, selectedToken, selectedChain, recipientInfo?.address, address, ensName])

  // Execute payment
  const handleExecute = useCallback(async () => {
    if (!address || !recipientInfo?.address || !amount || !quote) return

    setExecutionState('approving')
    setTxHash(null)

    try {
      // Check if we need to switch chains
      const targetChain = SUPPORTED_CHAINS.find((c) => c.id === selectedChain)
      if (targetChain && walletChainId !== targetChain.chainId) {
        await switchChainAsync({ chainId: targetChain.chainId })
      }

      // Get transaction data from execute API
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeId: quote.id,
          fromAddress: address,
          intent: {
            action: 'transfer',
            amount,
            fromToken: selectedToken,
            toToken: 'USDC',
            toAddress: recipientInfo.address,
            fromChain: selectedChain,
            toChain: 'base',
          },
          slippage: 0.005,
          ensName,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to prepare transaction')
      }

      const txData = await res.json()

      // Send transaction
      setExecutionState('pending')
      const hash = await sendTransactionAsync({
        to: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        value: txData.value ? BigInt(txData.value) : BigInt(0),
      })

      setTxHash(hash)
      setExecutionState('confirmed')
    } catch (e) {
      setExecutionState('error')
      const errMsg = e instanceof Error ? e.message : 'Transaction failed'
      if (/rejected|denied|user refused/i.test(errMsg)) {
        setQuoteError('Transaction was rejected')
      } else {
        setQuoteError(errMsg)
      }
    }
  }, [
    address,
    recipientInfo?.address,
    amount,
    quote,
    selectedChain,
    selectedToken,
    walletChainId,
    switchChainAsync,
    sendTransactionAsync,
    ensName,
  ])

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[#1C1B18]">
          Resolving {ensName}...
        </h1>
        <Card className="border-[#E4E2DC] bg-white">
          <CardContent className="p-8">
            <div className="flex items-center justify-center">
              <div className="animate-spin w-6 h-6 border-2 border-[#1C1B18] border-t-transparent rounded-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !recipientInfo?.address) {
    return (
      <div className="space-y-4">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[#1C1B18]">
          Payment Error
        </h1>
        <Card className="border-[#E4E2DC] bg-white">
          <CardContent className="p-8 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-red-600">
                <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-[#1C1B18] font-medium mb-2">
              Could not resolve {ensName}
            </p>
            <p className="text-sm text-[#6B6960]">
              {error || 'This ENS name may not exist or has no address set.'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const hasYieldVault = recipientInfo.yieldVault &&
    recipientInfo.yieldVault !== '0x0000000000000000000000000000000000000000'

  const isExecuting = executionState !== 'idle' && executionState !== 'error'
  const canExecute = amount && parseFloat(amount) > 0 && quote && !isExecuting

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[#1C1B18] mb-2">
          Pay {ensName}
        </h1>
        <p className="text-sm text-[#6B6960] font-mono">
          {recipientInfo.address?.slice(0, 6)}...{recipientInfo.address?.slice(-4)}
        </p>
      </div>

      {/* Yield indicator */}
      {hasYieldVault && (
        <div className="rounded-xl bg-[#EDF5F0] border border-[#B7D4C7] p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#2D6A4F] flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-[#2D6A4F]">
                Yield-enabled recipient
              </p>
              <p className="text-xs text-[#2D6A4F]/70 mt-0.5">
                Funds will be automatically deposited into their yield vault
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Success state */}
      {executionState === 'confirmed' && txHash && (
        <div className="rounded-xl bg-[#EDF5F0] border border-[#B7D4C7] p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#2D6A4F] flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white">
                <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#2D6A4F]">
                Payment sent!
              </p>
              <a
                href={`https://basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#2D6A4F]/70 font-mono break-all hover:underline"
              >
                {txHash}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Payment form */}
      <Card className="border-[#E4E2DC] bg-white">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold text-[#1C1B18]">
            Send Payment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Token and Chain selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-[#1C1B18] mb-1.5 block">
                Token
              </label>
              <select
                value={selectedToken}
                onChange={(e) => setSelectedToken(e.target.value)}
                disabled={isExecuting}
                className="w-full h-10 px-3 rounded-md border border-[#E4E2DC] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1B18] focus:border-transparent disabled:opacity-50"
              >
                {SUPPORTED_TOKENS.map((token) => (
                  <option key={token} value={token}>
                    {token}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-[#1C1B18] mb-1.5 block">
                From Chain
              </label>
              <select
                value={selectedChain}
                onChange={(e) => setSelectedChain(e.target.value)}
                disabled={isExecuting}
                className="w-full h-10 px-3 rounded-md border border-[#E4E2DC] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1B18] focus:border-transparent disabled:opacity-50"
              >
                {SUPPORTED_CHAINS.map((chain) => (
                  <option key={chain.id} value={chain.id}>
                    {chain.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label className="text-sm font-medium text-[#1C1B18] mb-1.5 block">
              Amount
            </label>
            <div className="relative">
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isExecuting}
                className="pr-16 h-12 text-lg border-[#E4E2DC] focus:border-[#1C1B18] focus:ring-[#1C1B18] disabled:opacity-50"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-[#6B6960]">
                {selectedToken}
              </div>
            </div>
          </div>

          {/* Quote display */}
          {quote && (
            <div className="rounded-lg bg-[#F8F7F4] p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-[#6B6960]">Route</span>
                <span className="text-[#1C1B18] font-medium">{quote.path}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#6B6960]">Est. fee</span>
                <span className="text-[#1C1B18]">{quote.fee}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#6B6960]">Est. time</span>
                <span className="text-[#1C1B18]">{quote.estimatedTime}</span>
              </div>
            </div>
          )}

          {/* Quote error */}
          {quoteError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {quoteError}
            </div>
          )}

          {/* Recipient preferences */}
          {(recipientInfo.preferredToken || recipientInfo.preferredChain) && (
            <div className="rounded-lg bg-[#F8F7F4] p-3 text-sm">
              <p className="text-[#6B6960]">
                Recipient prefers{' '}
                {recipientInfo.preferredToken && (
                  <span className="font-medium text-[#1C1B18]">
                    {recipientInfo.preferredToken}
                  </span>
                )}
                {recipientInfo.preferredToken && recipientInfo.preferredChain && ' on '}
                {recipientInfo.preferredChain && (
                  <span className="font-medium text-[#1C1B18]">
                    {recipientInfo.preferredChain}
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Connect / Pay button */}
          {!isConnected ? (
            <div className="pt-2">
              <ConnectButton.Custom>
                {({ openConnectModal }) => (
                  <Button
                    onClick={openConnectModal}
                    className="w-full h-12 bg-[#1C1B18] hover:bg-[#2D2C28] text-white font-medium"
                  >
                    Connect Wallet
                  </Button>
                )}
              </ConnectButton.Custom>
            </div>
          ) : (
            <Button
              className="w-full h-12 bg-[#1C1B18] hover:bg-[#2D2C28] text-white font-medium disabled:opacity-50"
              disabled={!canExecute}
              onClick={handleExecute}
            >
              {executionState === 'quoting' ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Getting quote...
                </span>
              ) : executionState === 'approving' ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Approve in wallet...
                </span>
              ) : executionState === 'pending' ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Confirming...
                </span>
              ) : executionState === 'confirmed' ? (
                'Payment sent!'
              ) : amount && parseFloat(amount) > 0 ? (
                `Pay ${parseFloat(amount).toFixed(2)} ${selectedToken}`
              ) : (
                'Enter amount'
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Info footer */}
      <p className="text-xs text-center text-[#6B6960]">
        Powered by LI.FI cross-chain routing
        {hasYieldVault && ' + YieldRoute auto-deposit'}
      </p>
    </div>
  )
}

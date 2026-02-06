'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount, useSendTransaction, useSwitchChain } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { OnrampModal } from '@/components/onramp-modal'
import { useGasTankPayment } from '@/hooks/use-gas-tank-payment'
import type { ENSResolution, RouteOption } from '@/lib/types'
import type { Address } from 'viem'

interface Props {
  ensName: string
  prefilledAmount?: string
  prefilledToken?: string
}

const SUPPORTED_TOKENS = ['USDC', 'USDT', 'DAI', 'ETH'] as const
const SUPPORTED_CHAINS = [
  { id: 'ethereum', name: 'Ethereum', chainId: 1 },
  { id: 'base', name: 'Base', chainId: 8453 },
  { id: 'arbitrum', name: 'Arbitrum', chainId: 42161 },
  { id: 'optimism', name: 'Optimism', chainId: 10 },
  { id: 'polygon', name: 'Polygon', chainId: 137 },
  { id: 'avalanche', name: 'Avalanche', chainId: 43114 },
  { id: 'bsc', name: 'BNB Chain', chainId: 56 },
  { id: 'zksync', name: 'zkSync Era', chainId: 324 },
  { id: 'linea', name: 'Linea', chainId: 59144 },
] as const

type ExecutionState = 'idle' | 'quoting' | 'checking-approval' | 'approving' | 'pending' | 'confirmed' | 'error'

// Block explorer URLs by chain
const BLOCK_EXPLORERS: Record<string, string> = {
  ethereum: 'https://etherscan.io',
  base: 'https://basescan.org',
  arbitrum: 'https://arbiscan.io',
  optimism: 'https://optimistic.etherscan.io',
  polygon: 'https://polygonscan.com',
  avalanche: 'https://snowtrace.io',
  bsc: 'https://bscscan.com',
  zksync: 'https://explorer.zksync.io',
  linea: 'https://lineascan.build',
}

type TokenBalance = {
  chain: string
  chainId: number
  token: string
  balance: string
  balanceUSD: number
}

function useBalances(address?: string) {
  const [balances, setBalances] = useState<TokenBalance[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!address) {
      setBalances([])
      return
    }

    setLoading(true)
    fetch(`/api/balances?address=${address}`)
      .then((r) => r.json())
      .then((data) => setBalances(data.balances || []))
      .catch(() => setBalances([]))
      .finally(() => setLoading(false))
  }, [address])

  return { balances, loading }
}

export function PaymentFlow({ ensName, prefilledAmount, prefilledToken }: Props) {
  const { address, isConnected, chainId: walletChainId } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const { switchChainAsync } = useSwitchChain()
  const { balances, loading: balancesLoading } = useBalances(address)

  const [amount, setAmount] = useState(prefilledAmount || '')
  const [selectedToken, setSelectedToken] = useState<string>(
    prefilledToken && SUPPORTED_TOKENS.includes(prefilledToken.toUpperCase() as typeof SUPPORTED_TOKENS[number])
      ? prefilledToken.toUpperCase()
      : 'USDC'
  )
  const [selectedChain, setSelectedChain] = useState<string>('base')
  const [recipientInfo, setRecipientInfo] = useState<ENSResolution | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAllChains, setShowAllChains] = useState(false)

  // Payment memo
  const [memo, setMemo] = useState('')
  const [showMemo, setShowMemo] = useState(false)

  // Quote state
  const [quote, setQuote] = useState<RouteOption | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [yieldVault, setYieldVault] = useState<string | null>(null)
  const [useYieldRoute, setUseYieldRoute] = useState(false)
  const [useRestakingRoute, setUseRestakingRoute] = useState(false)
  const [strategyName, setStrategyName] = useState<string | null>(null)
  const [protocol, setProtocol] = useState<string | null>(null)

  // Execution state
  const [executionState, setExecutionState] = useState<ExecutionState>('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [txChain, setTxChain] = useState<string>('base') // Track which chain tx was sent on

  // Destination is always USDC on Base (core product promise)
  // Recipient's "preference" is which vault to use, not the output token
  const destChain = 'base'
  const destToken = 'USDC'

  // Fiat onramp state
  const [showOnramp, setShowOnramp] = useState(false)
  const [onrampCompleted, setOnrampCompleted] = useState(false)

  // Gasless payment state
  // Gas tank payment (receiver pays gas, payer signs free)
  const [useGasTank, setUseGasTank] = useState(false)
  const gasTankPayment = useGasTankPayment()

  // Gas tank payments available on Base with USDC when receiver has tank balance
  const canUseGasTank = selectedChain === 'base' && selectedToken === 'USDC'

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
      setYieldVault(null)
      setUseYieldRoute(false)
      setUseRestakingRoute(false)
      setStrategyName(null)
      setProtocol(null)
      return
    }

    const controller = new AbortController()
    let cancelled = false

    async function fetchQuote() {
      setExecutionState('quoting')
      setQuoteError(null)

      try {
        const res = await fetch('/api/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            fromToken: selectedToken,
            toToken: destToken,
            fromChain: selectedChain,
            toChain: destChain,
            toAddress: ensName,
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
          setYieldVault(data.yieldVault || null)
          setUseYieldRoute(data.useYieldRoute || false)
          setUseRestakingRoute(data.useRestakingRoute || false)
          setStrategyName(data.strategyName || null)
          setProtocol(data.protocol || null)
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

    setExecutionState('checking-approval')
    setTxHash(null)
    setQuoteError(null)

    try {
      // Check if we need to switch chains
      const targetChain = SUPPORTED_CHAINS.find((c) => c.id === selectedChain)
      if (targetChain && walletChainId !== targetChain.chainId) {
        await switchChainAsync({ chainId: targetChain.chainId })
      }

      // Track which chain we're sending on for the block explorer link
      setTxChain(selectedChain)

      // Check token approval for ERC20 tokens (not needed for native ETH)
      if (selectedToken !== 'ETH') {
        setExecutionState('checking-approval')
        const approvalRes = await fetch('/api/approval/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: selectedToken,
            chain: selectedChain,
            owner: address,
            spender: quote.id === 'direct-transfer' ? recipientInfo.address : undefined,
            amount,
          }),
        })

        if (approvalRes.ok) {
          const approvalData = await approvalRes.json()
          if (approvalData.needsApproval) {
            setExecutionState('approving')
            // Send approval transaction
            const approvalHash = await sendTransactionAsync({
              to: approvalData.tokenAddress as `0x${string}`,
              data: approvalData.approvalData as `0x${string}`,
              value: BigInt(0),
            })
            // Wait a moment for approval to be indexed
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        }
        // If approval check fails, continue anyway - the execute API will handle it
      }

      setExecutionState('approving')

      // Determine action type based on route
      const actionType = useRestakingRoute ? 'restaking' : useYieldRoute ? 'yield' : 'transfer'

      // Get transaction data from execute API
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeId: quote.id,
          fromAddress: address,
          intent: {
            action: actionType,
            amount,
            fromToken: selectedToken,
            toToken: useRestakingRoute ? 'ezETH' : destToken,
            toAddress: recipientInfo.address,
            fromChain: selectedChain,
            toChain: destChain,
            memo: memo || undefined,
          },
          slippage: useRestakingRoute ? 0.01 : 0.005, // Higher slippage for restaking
          ensName,
          // Yield route params
          ...(useYieldRoute && yieldVault && {
            yieldVault,
            recipient: recipientInfo.address,
          }),
          // Restaking route params
          ...(useRestakingRoute && {
            useRestakingRoute: true,
            recipient: recipientInfo.address,
          }),
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
    useYieldRoute,
    useRestakingRoute,
    yieldVault,
    memo,
  ])

  // Check if receiver can accept gas tank payments
  useEffect(() => {
    if (recipientInfo?.address && canUseGasTank) {
      gasTankPayment.checkReceiver(recipientInfo.address as Address)
    }
  }, [recipientInfo?.address, canUseGasTank, gasTankPayment.checkReceiver])

  // Execute gas tank payment (receiver pays gas, payer just signs)
  const handleGasTankExecute = useCallback(async () => {
    if (!address || !recipientInfo?.address || !amount) return

    try {
      // Convert amount to USDC decimals (6)
      const amountInDecimals = BigInt(Math.floor(parseFloat(amount) * 1_000_000))

      // Only pass vault if yield route is enabled
      const vaultAddress = useYieldRoute && yieldVault ? yieldVault as Address : undefined

      await gasTankPayment.executePayment({
        receiver: recipientInfo.address as Address,
        amount: amountInDecimals,
        vault: vaultAddress,
      })
    } catch (e) {
      console.error('Gas tank payment failed:', e)
    }
  }, [address, recipientInfo?.address, amount, yieldVault, useYieldRoute, gasTankPayment])

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

      {/* Payment request indicator */}
      {prefilledAmount && (
        <div className="rounded-xl bg-[#F0F4FF] border border-[#B7C7E8] p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#3B5998] flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white">
                <path d="M12 2V6M12 18V22M6 12H2M22 12H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-[#3B5998]">
                Payment request for ${prefilledAmount}
              </p>
              <p className="text-xs text-[#3B5998]/70">
                Amount has been pre-filled by the recipient
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
                href={`${BLOCK_EXPLORERS[txChain] || BLOCK_EXPLORERS.base}/tx/${txHash}`}
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
          {/* Smart balance-aware selection */}
          {isConnected && balances.length > 0 && !balancesLoading && (
            <div>
              <label className="text-sm font-medium text-[#1C1B18] mb-2 block">
                Pay with your balance
              </label>
              <div className="space-y-2">
                {balances.slice(0, 4).map((bal) => {
                  const chain = SUPPORTED_CHAINS.find((c) => c.name.toLowerCase() === bal.chain.toLowerCase())
                  const isSelected = selectedToken === bal.token && selectedChain === (chain?.id || bal.chain)
                  return (
                    <button
                      key={`${bal.chain}-${bal.token}`}
                      onClick={() => {
                        setSelectedToken(bal.token)
                        setSelectedChain(chain?.id || bal.chain)
                      }}
                      disabled={isExecuting}
                      className={`w-full p-3 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'border-[#1C1B18] bg-[#F8F7F4]'
                          : 'border-[#E4E2DC] hover:border-[#9C9B93]'
                      } disabled:opacity-50`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#1C1B18]">{bal.token}</span>
                          <span className="text-xs text-[#6B6960] capitalize">on {bal.chain}</span>
                        </div>
                        <span className="text-sm text-[#6B6960]">
                          {parseFloat(bal.balance).toFixed(2)} ({`$${bal.balanceUSD.toFixed(2)}`})
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
              {balances.length > 4 && (
                <button
                  onClick={() => setShowAllChains(!showAllChains)}
                  className="mt-2 text-sm text-[#6B6960] hover:text-[#1C1B18]"
                >
                  {showAllChains ? 'Show less' : `+${balances.length - 4} more options`}
                </button>
              )}
              {showAllChains && balances.slice(4).map((bal) => {
                const chain = SUPPORTED_CHAINS.find((c) => c.name.toLowerCase() === bal.chain.toLowerCase())
                const isSelected = selectedToken === bal.token && selectedChain === (chain?.id || bal.chain)
                return (
                  <button
                    key={`${bal.chain}-${bal.token}`}
                    onClick={() => {
                      setSelectedToken(bal.token)
                      setSelectedChain(chain?.id || bal.chain)
                    }}
                    disabled={isExecuting}
                    className={`w-full p-3 rounded-lg border text-left transition-all mt-2 ${
                      isSelected
                        ? 'border-[#1C1B18] bg-[#F8F7F4]'
                        : 'border-[#E4E2DC] hover:border-[#9C9B93]'
                    } disabled:opacity-50`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[#1C1B18]">{bal.token}</span>
                        <span className="text-xs text-[#6B6960] capitalize">on {bal.chain}</span>
                      </div>
                      <span className="text-sm text-[#6B6960]">
                        {parseFloat(bal.balance).toFixed(2)} ({`$${bal.balanceUSD.toFixed(2)}`})
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Fallback: Manual token/chain selectors */}
          {(!isConnected || balances.length === 0) && (
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
          )}

          {/* Loading balances indicator */}
          {isConnected && balancesLoading && (
            <div className="flex items-center gap-2 text-sm text-[#6B6960]">
              <div className="animate-spin w-4 h-4 border-2 border-[#6B6960] border-t-transparent rounded-full" />
              Scanning your balances across 9 chains...
            </div>
          )}

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

          {/* Payment memo */}
          <div>
            {!showMemo ? (
              <button
                onClick={() => setShowMemo(true)}
                disabled={isExecuting}
                className="text-sm text-[#6B6960] hover:text-[#1C1B18] flex items-center gap-1 disabled:opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                Add a note
              </button>
            ) : (
              <div>
                <label className="text-sm font-medium text-[#1C1B18] mb-1.5 block">
                  Note (optional)
                </label>
                <Input
                  placeholder="e.g. March invoice, coffee payment..."
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  maxLength={100}
                  disabled={isExecuting}
                  className="border-[#E4E2DC] disabled:opacity-50"
                />
                <p className="text-xs text-[#9C9B93] mt-1">{memo.length}/100</p>
              </div>
            )}
          </div>

          {/* Quote display */}
          {quote && (
            <div className="rounded-lg bg-[#F8F7F4] p-3 space-y-1">
              {useRestakingRoute && (
                <div className="flex items-center gap-2 text-sm text-[#7C3AED] pb-2 mb-2 border-b border-[#E4E2DC]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Restaking: receives WETH ready for Renzo deposit</span>
                </div>
              )}
              {useYieldRoute && !useRestakingRoute && (
                <div className="flex items-center gap-2 text-sm text-[#2D6A4F] pb-2 mb-2 border-b border-[#E4E2DC]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Auto-deposits to recipient&apos;s yield vault</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-[#6B6960]">Route</span>
                <span className="text-[#1C1B18] font-medium">{quote.path}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#6B6960]">Est. fee</span>
                <span className="text-[#1C1B18]">{quote.fee}</span>
              </div>
              {/* Fee warning if fee > payment amount */}
              {(() => {
                const feeNum = parseFloat(quote.fee.replace(/[^0-9.]/g, ''))
                const amountNum = parseFloat(amount || '0')
                // Rough USD estimate: assume stablecoins are $1, ETH ~$2500
                const amountUSD = selectedToken === 'ETH' ? amountNum * 2500 : amountNum
                if (!isNaN(feeNum) && feeNum > amountUSD && amountUSD > 0) {
                  return (
                    <div className="flex items-center gap-2 text-xs text-amber-600 mt-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                      <span>Fee exceeds payment amount</span>
                    </div>
                  )
                }
                return null
              })()}
              <div className="flex justify-between text-sm">
                <span className="text-[#6B6960]">Est. time</span>
                <span className="text-[#1C1B18]">{quote.estimatedTime}</span>
              </div>
            </div>
          )}

          {/* Gas tank payment toggle */}
          {canUseGasTank && quote && gasTankPayment.canReceiverAccept && (
            <div className="rounded-lg bg-[#F0FFF4] border border-[#9AE6B4] p-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[#22C55E]">
                    <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <div>
                    <span className="text-sm font-medium text-[#166534]">Pay $0 Gas</span>
                    <p className="text-xs text-[#22C55E]">Just sign - receiver covers gas</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={useGasTank}
                  onClick={() => setUseGasTank(!useGasTank)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    useGasTank ? 'bg-[#22C55E]' : 'bg-[#E4E2DC]'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      useGasTank ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </label>
            </div>
          )}

          {/* Gas tank payment status */}
          {useGasTank && gasTankPayment.status !== 'idle' && (
            <div className={`rounded-lg p-3 text-sm ${
              gasTankPayment.status === 'success'
                ? 'bg-[#EDF5F0] text-[#2D6A4F]'
                : gasTankPayment.status === 'error'
                ? 'bg-red-50 text-red-600'
                : 'bg-[#F8F7F4] text-[#6B6960]'
            }`}>
              {gasTankPayment.status === 'checking' && (
                <span className="flex items-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                  Checking receiver&apos;s gas tank...
                </span>
              )}
              {gasTankPayment.status === 'signing' && (
                <span className="flex items-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                  Sign the permit in your wallet (free, no gas)...
                </span>
              )}
              {gasTankPayment.status === 'executing' && (
                <span className="flex items-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                  Executing payment (gas from receiver&apos;s tank)...
                </span>
              )}
              {gasTankPayment.status === 'success' && (
                <span className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Payment successful! You paid $0 gas.
                </span>
              )}
              {gasTankPayment.status === 'error' && (
                <span>{gasTankPayment.error || 'Payment failed'}</span>
              )}
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
            <div className="pt-2 space-y-3">
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

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[#E4E2DC]" />
                <span className="text-xs text-[#9C9B93]">or</span>
                <div className="flex-1 h-px bg-[#E4E2DC]" />
              </div>

              {/* Pay with Card - no wallet needed */}
              <Button
                variant="outline"
                onClick={() => setShowOnramp(true)}
                className="w-full h-12 border-[#E4E2DC] hover:bg-[#F8F7F4] font-medium"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mr-2">
                  <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2"/>
                  <path d="M3 10H21" stroke="currentColor" strokeWidth="2"/>
                </svg>
                Pay with Card
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Button
                className={`w-full h-12 font-medium disabled:opacity-50 ${
                  useGasTank
                    ? 'bg-[#22C55E] hover:bg-[#16A34A] text-white'
                    : 'bg-[#1C1B18] hover:bg-[#2D2C28] text-white'
                }`}
                disabled={!canExecute || (useGasTank && gasTankPayment.status !== 'idle' && gasTankPayment.status !== 'error')}
                onClick={useGasTank ? handleGasTankExecute : handleExecute}
              >
                {/* Gas tank payment states */}
                {useGasTank && gasTankPayment.status === 'signing' ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Sign permit (free)...
                  </span>
                ) : useGasTank && gasTankPayment.status === 'executing' ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Executing...
                  </span>
                ) : useGasTank && gasTankPayment.status === 'success' ? (
                  'Paid $0 gas!'
                ) : /* Regular payment states */
                executionState === 'quoting' ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Getting quote...
                  </span>
                ) : executionState === 'checking-approval' ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Checking approval...
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
                  useGasTank
                    ? `Pay $0 Gas - ${parseFloat(amount) < 0.01 ? amount : parseFloat(amount).toFixed(2)} ${selectedToken}`
                    : `Pay ${parseFloat(amount) < 0.01 ? amount : parseFloat(amount).toFixed(2)} ${selectedToken}`
                ) : (
                  'Enter amount'
                )}
              </Button>

              {/* Pay with Card option for connected users too */}
              {balances.length === 0 && !balancesLoading && (
                <>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-[#E4E2DC]" />
                    <span className="text-xs text-[#9C9B93]">no balance?</span>
                    <div className="flex-1 h-px bg-[#E4E2DC]" />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setShowOnramp(true)}
                    className="w-full h-10 border-[#E4E2DC] hover:bg-[#F8F7F4] text-sm"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mr-2">
                      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2"/>
                      <path d="M3 10H21" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                    Buy USDC with Card
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info footer */}
      <p className="text-xs text-center text-[#6B6960]">
        Powered by LI.FI cross-chain routing
      </p>

      {/* Onramp Modal */}
      <OnrampModal
        isOpen={showOnramp}
        onClose={() => {
          setShowOnramp(false)
          // Refresh balances after onramp
          if (onrampCompleted && address) {
            setOnrampCompleted(false)
            // Force balance refresh by triggering a re-render
            window.location.reload()
          }
        }}
        walletAddress={address || ''}
        fiatAmount={amount ? parseFloat(amount) : undefined}
        onOrderCompleted={() => {
          setOnrampCompleted(true)
          // Auto-select USDC on Base after purchase
          setSelectedToken('USDC')
          setSelectedChain('base')
        }}
      />
    </div>
  )
}

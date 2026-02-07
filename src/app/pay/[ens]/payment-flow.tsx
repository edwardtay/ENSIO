'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useSendTransaction, useSwitchChain } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { OnrampModal } from '@/components/onramp-modal'
import { useGasTankPayment } from '@/hooks/use-gas-tank-payment'
import type { ENSResolution, RouteOption } from '@/lib/types'
import type { Address } from 'viem'

interface Props {
  ensName: string
  prefilledAmount?: string
  prefilledToken?: string
  invoiceId?: string
  invoiceMemo?: string
}

const SUPPORTED_CHAINS = [
  { id: 'ethereum', name: 'Ethereum', chainId: 1 },
  { id: 'base', name: 'Base', chainId: 8453 },
  { id: 'arbitrum', name: 'Arbitrum', chainId: 42161 },
  { id: 'optimism', name: 'Optimism', chainId: 10 },
] as const

const BLOCK_EXPLORERS: Record<string, string> = {
  ethereum: 'https://etherscan.io',
  base: 'https://basescan.org',
  arbitrum: 'https://arbiscan.io',
  optimism: 'https://optimistic.etherscan.io',
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

export function PaymentFlow({ ensName, prefilledAmount, invoiceId, invoiceMemo }: Props) {
  const { address, isConnected, chainId: walletChainId } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const { switchChainAsync } = useSwitchChain()
  const { balances, loading: balancesLoading } = useBalances(address)
  const gasTankPayment = useGasTankPayment()

  const [amount, setAmount] = useState(prefilledAmount || '')
  const [recipientInfo, setRecipientInfo] = useState<ENSResolution | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Auto-selected payment method
  const [selectedToken, setSelectedToken] = useState('USDC')
  const [selectedChain, setSelectedChain] = useState('base')
  const [showOptions, setShowOptions] = useState(false)

  // Quote & execution
  const [quote, setQuote] = useState<RouteOption | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [yieldVault, setYieldVault] = useState<string | null>(null)
  const [useYieldRoute, setUseYieldRoute] = useState(false)
  const [useV4Route, setUseV4Route] = useState(false)
  // Fee tier info from incentive system
  const [feeTier, setFeeTier] = useState<{
    tier: string
    feePercent: string
    nextTier: string | null
    volumeToNextTier: number
    percentToNextTier: string
    yieldShareRate: string | null
  } | null>(null)
  const [executing, setExecuting] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [executedProvider, setExecutedProvider] = useState<string | null>(null)
  const [v4HookAddress, setV4HookAddress] = useState<string | null>(null)
  const [showOnramp, setShowOnramp] = useState(false)

  // Auto-select best balance when balances load
  useEffect(() => {
    if (balances.length > 0 && !showOptions) {
      // Prefer USDC on Base, otherwise highest USD balance
      const usdcBase = balances.find(b => b.token === 'USDC' && b.chain.toLowerCase() === 'base')
      const best = usdcBase || balances[0]
      if (best) {
        setSelectedToken(best.token)
        const chain = SUPPORTED_CHAINS.find(c => c.name.toLowerCase() === best.chain.toLowerCase())
        setSelectedChain(chain?.id || 'base')
      }
    }
  }, [balances, showOptions])

  // Fetch recipient ENS info
  useEffect(() => {
    async function fetchRecipient() {
      try {
        const res = await fetch(`/api/ens/resolve?name=${encodeURIComponent(ensName)}`)
        if (!res.ok) throw new Error('Failed to resolve ENS')
        setRecipientInfo(await res.json())
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load recipient')
      } finally {
        setLoading(false)
      }
    }
    fetchRecipient()
  }, [ensName])

  // Check if receiver can accept gas tank payments
  useEffect(() => {
    if (recipientInfo?.address && selectedChain === 'base' && selectedToken === 'USDC') {
      gasTankPayment.checkReceiver(recipientInfo.address as Address)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientInfo?.address, selectedChain, selectedToken])

  // Fetch quote
  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0 || !recipientInfo?.address || !address) {
      setQuote(null)
      return
    }

    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch('/api/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            fromToken: selectedToken,
            toToken: 'USDC',
            fromChain: selectedChain,
            toChain: 'base',
            toAddress: ensName,
            userAddress: address,
            slippage: 0.005,
          }),
          signal: controller.signal,
        })
        const data = await res.json()
        if (data.routes?.[0]) {
          setQuote(data.routes[0])
          setYieldVault(data.yieldVault || null)
          setUseYieldRoute(data.useYieldRoute || false)
          setUseV4Route(data.useV4Route || false)
          // Set fee tier info from incentive system
          if (data.feeTier) {
            setFeeTier(data.feeTier)
          }
        }
      } catch {}
    }, 500)

    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [amount, selectedToken, selectedChain, recipientInfo?.address, address, ensName])

  // Execute payment
  const handlePay = useCallback(async () => {
    if (!address || !recipientInfo?.address || !amount || !quote) return

    setExecuting(true)
    setQuoteError(null)

    try {
      // Use gas tank if available (auto, no toggle needed)
      const useGasTank = selectedChain === 'base' && selectedToken === 'USDC' && gasTankPayment.canReceiverAccept

      if (useGasTank) {
        const amountInDecimals = BigInt(Math.floor(parseFloat(amount) * 1_000_000))
        await gasTankPayment.executePayment({
          receiver: recipientInfo.address as Address,
          amount: amountInDecimals,
          vault: useYieldRoute && yieldVault ? yieldVault as Address : undefined,
        })
        setTxHash('gas-tank')
        return
      }

      // Regular payment
      const targetChain = SUPPORTED_CHAINS.find(c => c.id === selectedChain)
      if (targetChain && walletChainId !== targetChain.chainId) {
        await switchChainAsync({ chainId: targetChain.chainId })
      }

      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeId: quote.id,
          fromAddress: address,
          intent: {
            action: useYieldRoute ? 'yield' : 'transfer',
            amount,
            fromToken: selectedToken,
            toToken: 'USDC',
            toAddress: recipientInfo.address,
            fromChain: selectedChain,
            toChain: 'base',
          },
          slippage: 0.005,
          ensName,
          ...(useYieldRoute && yieldVault && { yieldVault, recipient: recipientInfo.address }),
        }),
      })

      if (!res.ok) throw new Error('Failed to prepare transaction')
      const txData = await res.json()

      const hash = await sendTransactionAsync({
        to: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        value: txData.value ? BigInt(txData.value) : BigInt(0),
      })

      setTxHash(hash)
      setExecutedProvider(txData.provider || null)
      setV4HookAddress(txData.hookAddress || null)

      // Mark invoice as paid if this was an invoice payment
      if (invoiceId && hash) {
        fetch('/api/invoice', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: invoiceId, status: 'paid', txHash: hash }),
        }).catch(() => {}) // Fire and forget
      }
    } catch (e) {
      setQuoteError(e instanceof Error ? e.message : 'Payment failed')
    } finally {
      setExecuting(false)
    }
  }, [address, recipientInfo, amount, quote, selectedChain, selectedToken, walletChainId, switchChainAsync, sendTransactionAsync, ensName, useYieldRoute, yieldVault, gasTankPayment, invoiceId])

  // Loading state
  if (loading) {
    return (
      <Card className="border-[#E4E2DC] bg-white max-w-md mx-auto">
        <CardContent className="p-8 flex justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-[#1C1B18] border-t-transparent rounded-full" />
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error || !recipientInfo?.address) {
    return (
      <Card className="border-[#E4E2DC] bg-white max-w-md mx-auto">
        <CardContent className="p-6 text-center">
          <p className="text-[#1C1B18] font-medium">Could not find {ensName}</p>
          <p className="text-sm text-[#6B6960] mt-1">{error || 'ENS name not found'}</p>
        </CardContent>
      </Card>
    )
  }

  // Success state
  if (txHash) {
    const isV4Swap = executedProvider?.includes('Uniswap v4')
    const txUrl = `${BLOCK_EXPLORERS[selectedChain] || BLOCK_EXPLORERS.base}/tx/${txHash}`

    return (
      <Card className="border-[#E4E2DC] bg-white max-w-md mx-auto">
        <CardContent className="p-6 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-[#22C55E] flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-white">
              <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[#1C1B18]">Payment sent!</h2>
            <p className="text-sm text-[#6B6960] mt-1">{amount} {selectedToken} to {ensName}</p>
          </div>

          {/* V4 Hook Badge */}
          {isV4Swap && (
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FF007A]/10 text-[#FF007A] text-sm font-medium">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                Swapped via Uniswap v4 Hook
              </div>
              {v4HookAddress && (
                <a
                  href={`${BLOCK_EXPLORERS[selectedChain] || BLOCK_EXPLORERS.base}/address/${v4HookAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-[#6B6960] hover:text-[#FF007A] font-mono"
                >
                  PayAgentHook: {v4HookAddress.slice(0, 6)}...{v4HookAddress.slice(-4)}
                </a>
              )}
            </div>
          )}

          {txHash !== 'gas-tank' && (
            <div className="space-y-2">
              <a
                href={txUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-[#6B6960] hover:text-[#1C1B18] underline"
              >
                View transaction
              </a>
              {isV4Swap && (
                <a
                  href={`${txUrl}#eventlog`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-[#FF007A] hover:text-[#FF007A]/80 underline"
                >
                  View hook events →
                </a>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const canPay = amount && parseFloat(amount) > 0 && quote && !executing
  const selectedBalance = balances.find(b =>
    b.token === selectedToken &&
    b.chain.toLowerCase() === SUPPORTED_CHAINS.find(c => c.id === selectedChain)?.name.toLowerCase()
  )

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-[#1C1B18]">Pay {ensName}</h1>
        <p className="text-sm text-[#6B6960] font-mono">
          {recipientInfo.address?.slice(0, 6)}...{recipientInfo.address?.slice(-4)}
        </p>
        {invoiceId && (
          <p className="text-xs text-[#9C9B93] mt-1">Invoice #{invoiceId.toUpperCase()}</p>
        )}
      </div>

      {/* Invoice Memo */}
      {invoiceMemo && (
        <div className="rounded-lg bg-[#F8F7F4] p-3 text-center">
          <p className="text-sm text-[#1C1B18]">{invoiceMemo}</p>
        </div>
      )}

      <Card className="border-[#E4E2DC] bg-white">
        <CardContent className="p-5 space-y-4">
          {/* Amount input */}
          <div>
            <div className="relative">
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={executing}
                className="pr-20 h-14 text-2xl border-[#E4E2DC] focus:border-[#1C1B18]"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-[#6B6960]">
                {selectedToken}
              </div>
            </div>
          </div>

          {/* Selected payment method - compact */}
          {isConnected && selectedBalance && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#6B6960]">
                Paying with {selectedToken} on {SUPPORTED_CHAINS.find(c => c.id === selectedChain)?.name}
              </span>
              <button
                onClick={() => setShowOptions(!showOptions)}
                className="text-[#6B6960] hover:text-[#1C1B18] underline"
              >
                Change
              </button>
            </div>
          )}

          {/* Expandable options */}
          {showOptions && balances.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[#E4E2DC]">
              {balances.slice(0, 5).map((bal) => {
                const chain = SUPPORTED_CHAINS.find(c => c.name.toLowerCase() === bal.chain.toLowerCase())
                const isSelected = selectedToken === bal.token && selectedChain === chain?.id
                return (
                  <button
                    key={`${bal.chain}-${bal.token}`}
                    onClick={() => {
                      setSelectedToken(bal.token)
                      setSelectedChain(chain?.id || 'base')
                      setShowOptions(false)
                    }}
                    className={`w-full p-3 rounded-lg border text-left text-sm ${
                      isSelected ? 'border-[#1C1B18] bg-[#F8F7F4]' : 'border-[#E4E2DC]'
                    }`}
                  >
                    <span className="font-medium">{bal.token}</span>
                    <span className="text-[#6B6960]"> on {bal.chain}</span>
                    <span className="float-right text-[#6B6960]">${bal.balanceUSD.toFixed(2)}</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Loading balances */}
          {isConnected && balancesLoading && (
            <p className="text-sm text-[#6B6960]">Finding your balances...</p>
          )}

          {/* Fee disclosure with tier info */}
          {quote && amount && parseFloat(amount) > 0 && (
            <div className="rounded-lg bg-[#F8F7F4] p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#6B6960]">You send</span>
                <span className="text-[#1C1B18] font-medium">{parseFloat(amount).toFixed(2)} {selectedToken}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#6B6960]">Network + routing</span>
                <span className="text-[#1C1B18]">{quote.fee}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#6B6960]">Protocol fee</span>
                <span className="text-[#1C1B18]">
                  {feeTier?.feePercent || '0.1%'}
                  {feeTier?.tier && feeTier.tier !== 'Starter' && (
                    <span className="ml-1 text-xs text-[#22C55E]">({feeTier.tier})</span>
                  )}
                </span>
              </div>
              <div className="border-t border-[#E4E2DC] pt-2 flex items-center justify-between text-sm">
                <span className="text-[#6B6960]">{ensName} receives</span>
                <span className="text-[#22C55E] font-semibold">
                  ~{(parseFloat(amount) * (1 - (parseFloat(feeTier?.feePercent || '0.1') / 100))).toFixed(2)} USDC
                </span>
              </div>
              {/* Tier progress */}
              {feeTier?.nextTier && (
                <div className="pt-1">
                  <div className="flex items-center justify-between text-xs text-[#9C9B93]">
                    <span>{feeTier.tier} tier</span>
                    <span>${feeTier.volumeToNextTier?.toLocaleString()} to {feeTier.nextTier}</span>
                  </div>
                  <div className="mt-1 h-1 bg-[#E4E2DC] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#22C55E] rounded-full transition-all"
                      style={{ width: `${feeTier.percentToNextTier}%` }}
                    />
                  </div>
                </div>
              )}
              {/* Yield share info */}
              {feeTier?.yieldShareRate && useYieldRoute && (
                <div className="flex items-center justify-between text-xs text-[#6B6960]">
                  <span>Yield share (protocol)</span>
                  <span className="text-[#1C1B18]">{feeTier.yieldShareRate} of earnings</span>
                </div>
              )}
              {useYieldRoute && (
                <div className="flex items-center justify-between text-xs text-[#6B6960]">
                  <span>Auto-deposited to</span>
                  <span className="text-[#1C1B18]">Yield vault (~5% APY)</span>
                </div>
              )}
              {useV4Route && (
                <div className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md bg-[#FF007A]/10 text-[#FF007A] text-xs font-medium mt-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                  </svg>
                  Swapped via Uniswap v4
                </div>
              )}
              <p className="text-xs text-[#9C9B93] text-center pt-1">
                Lower than Coinbase (1.5%) or PayPal (2.9%)
              </p>
            </div>
          )}

          {/* Error */}
          {quoteError && (
            <p className="text-sm text-red-600">{quoteError}</p>
          )}

          {/* Pay button */}
          {!isConnected ? (
            <div className="space-y-3">
              <ConnectButton.Custom>
                {({ openConnectModal }) => (
                  <Button
                    onClick={openConnectModal}
                    className="w-full h-12 bg-[#1C1B18] hover:bg-[#2D2C28] text-white"
                  >
                    Connect Wallet
                  </Button>
                )}
              </ConnectButton.Custom>
              <Button
                variant="outline"
                onClick={() => setShowOnramp(true)}
                className="w-full h-10 border-[#E4E2DC]"
              >
                Pay with Card
              </Button>
            </div>
          ) : (
            <Button
              onClick={handlePay}
              disabled={!canPay}
              className="w-full h-12 bg-[#1C1B18] hover:bg-[#2D2C28] text-white disabled:opacity-50"
            >
              {executing ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  {gasTankPayment.status === 'signing' ? 'Sign in wallet...' : 'Sending...'}
                </span>
              ) : amount && parseFloat(amount) > 0 ? (
                `Pay ${parseFloat(amount).toFixed(2)} ${selectedToken}`
              ) : (
                'Enter amount'
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      <OnrampModal
        isOpen={showOnramp}
        onClose={() => setShowOnramp(false)}
        walletAddress={address || ''}
        fiatAmount={amount ? parseFloat(amount) : undefined}
      />
    </div>
  )
}

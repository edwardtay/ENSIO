'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAccount, useSendTransaction, useSignTypedData } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MessageBubble } from './message-bubble'
import type { Message, RouteOption, ParsedIntent } from '@/lib/types'
import { PREFERENCE_DOMAIN, PREFERENCE_TYPES, buildPreferenceMessage } from '@/lib/ens/eip712'

const STORE_OF_VALUE_OPTIONS = [
  { label: 'USDC', message: 'Set my preferred store of value to USDC' },
  { label: 'ETH', message: 'Set my preferred store of value to ETH' },
  { label: 'cbBTC', message: 'Set my preferred store of value to cbBTC' },
]

export function ChatInterface() {
  const { address, chainId } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const { signTypedDataAsync } = useSignTypedData()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [slippage] = useState('0.5')
  const [isLoading, setIsLoading] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastRequestRef = useRef<{ message: string; address?: string } | null>(null)

  const hasMessages = messages.length > 0

  // Auto-scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading, isExecuting, scrollToBottom])

  const sendMessage = useCallback(async (text: string, displayText?: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: displayText || trimmed,
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    lastRequestRef.current = { message: trimmed, address }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          userAddress: address,
          slippage: parseFloat(slippage) / 100,
        }),
      })

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`)
      }

      const data = await res.json()

      const agentMessage: Message = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: data.content ?? data.message ?? 'I received your request.',
        intent: data.intent,
        routes: data.routes,
        txHash: data.txHash,
        timestamp: Date.now(),
        ensName: data.ensName,
      }

      setMessages((prev) => [...prev, agentMessage])
    } catch {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'agent',
        content:
          'Sorry, I encountered an error processing your request. The chat API is not available yet -- please try again later.',
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }, [isLoading, address, slippage])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleQuickAction = (message: string, displayText?: string) => {
    sendMessage(message, displayText)
  }

  const handleRefreshRoutes = useCallback(async () => {
    if (!lastRequestRef.current || isLoading) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: lastRequestRef.current.message,
          userAddress: lastRequestRef.current.address,
          slippage: parseFloat(slippage) / 100,
        }),
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json()
      const refreshedMessage: Message = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: 'Routes refreshed! Here are the latest options:',
        intent: data.intent,
        routes: data.routes,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, refreshedMessage])
    } catch {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: 'Failed to refresh routes. Please try again.',
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, slippage])

  const handleSelectRoute = async (route: RouteOption, intent?: ParsedIntent, ensName?: string) => {
    // Skip execution for error routes or x402 (handled separately)
    if (route.id === 'error' || route.provider === 'x402') return

    if (!address) {
      const walletMsg: Message = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: 'Please connect your wallet first to execute this transaction.',
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, walletMsg])
      return
    }

    if (!intent) {
      const noIntentMsg: Message = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: 'Unable to determine the transaction intent. Please try your request again.',
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, noIntentMsg])
      return
    }

    // --- Free offchain ENS preference signing ---
    if (route.id === 'ens-preference' && ensName) {
      setIsExecuting(true)
      try {
        // Fetch current nonce
        const nonceRes = await fetch(`/api/ens/preferences?name=${encodeURIComponent(ensName)}`)
        const { nonce } = await nonceRes.json()

        const token = intent.toToken || 'USDC'
        const chain = intent.toChain || 'base'
        const message = buildPreferenceMessage(ensName, token, chain, BigInt(nonce))

        // Sign EIP-712 typed data (free, no gas)
        const signature = await signTypedDataAsync({
          domain: PREFERENCE_DOMAIN,
          types: PREFERENCE_TYPES,
          primaryType: 'SetPreference',
          message,
        })

        // Submit to API
        const res = await fetch('/api/ens/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ensName,
            token,
            chain,
            nonce: nonce.toString(),
            signature,
            signerAddress: address,
          }),
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || 'Failed to save preference')
        }

        const successMsg: Message = {
          id: crypto.randomUUID(),
          role: 'agent',
          content: `Preference saved! ${ensName} is now set to receive ${token} on ${chain.charAt(0).toUpperCase() + chain.slice(1)}. Anyone paying ${ensName} will auto-route to your preferred token.`,
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, successMsg])
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : 'Failed to set preference'
        const isRejected =
          errMessage.toLowerCase().includes('rejected') ||
          errMessage.toLowerCase().includes('denied') ||
          errMessage.toLowerCase().includes('user refused')
        const displayMsg = isRejected
          ? 'Signature request was rejected in your wallet.'
          : `Failed to set preference: ${errMessage}`

        const errorMsg: Message = {
          id: crypto.randomUUID(),
          role: 'agent',
          content: displayMsg,
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, errorMsg])
      } finally {
        setIsExecuting(false)
      }
      return
    }

    // Go straight to execution — no intermediate messages
    setIsExecuting(true)

    try {
      // Fetch transaction data from execute API
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeId: route.id,
          fromAddress: address,
          intent,
          slippage: parseFloat(slippage) / 100,
          ...(ensName ? { ensName } : {}),
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `API error: ${res.status}`)
      }

      let txData = await res.json()

      // Handle multi-step approvals for v4 swaps
      while (txData.provider?.startsWith('Approval:')) {
        const approvalLabel = txData.provider.replace('Approval: ', '')
        const approvalMsg: Message = {
          id: crypto.randomUUID(),
          role: 'agent',
          content: `Approval needed: ${approvalLabel}. Please confirm in your wallet.`,
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, approvalMsg])

        await sendTransactionAsync({
          to: txData.to as `0x${string}`,
          data: txData.data as `0x${string}`,
          value: txData.value ? BigInt(txData.value) : BigInt(0),
        })

        const confirmedMsg: Message = {
          id: crypto.randomUUID(),
          role: 'agent',
          content: `Approval confirmed. Preparing next step...`,
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, confirmedMsg])

        // Re-fetch to get next step (or the actual swap)
        const nextRes = await fetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            routeId: route.id,
            fromAddress: address,
            intent,
            slippage: parseFloat(slippage) / 100,
          }),
        })

        if (!nextRes.ok) {
          const errData = await nextRes.json().catch(() => ({}))
          throw new Error(errData.error || `API error: ${nextRes.status}`)
        }

        txData = await nextRes.json()
      }

      // Send the actual swap transaction
      const hash = await sendTransactionAsync({
        to: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        value: txData.value ? BigInt(txData.value) : BigInt(0),
      })

      // Success - show the txHash
      const successMsg: Message = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: 'Transaction submitted successfully!',
        txHash: hash,
        chainId,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, successMsg])
    } catch (err: unknown) {
      const errMessage =
        err instanceof Error ? err.message : 'Transaction failed'
      // Check for user rejection
      const isRejected =
        errMessage.toLowerCase().includes('rejected') ||
        errMessage.toLowerCase().includes('denied') ||
        errMessage.toLowerCase().includes('user refused')
      const displayMsg = isRejected
        ? 'Transaction was rejected in your wallet.'
        : `Transaction failed: ${errMessage}`

      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: 'agent',
        content: displayMsg,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages area or empty state */}
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="h-full overflow-y-auto">
          {hasMessages ? (
            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-1">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onSelectRoute={handleSelectRoute}
                  onRefreshRoutes={handleRefreshRoutes}
                />
              ))}

              {/* Typing / executing indicator */}
              {(isLoading || isExecuting) && (
                <div className="flex justify-start mb-4 message-enter">
                  <div className="bg-white border border-[#E4E2DC] rounded-2xl rounded-bl-sm px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-[#A17D2F] rounded-full pulse-dot" />
                      <span className="w-1.5 h-1.5 bg-[#A17D2F] rounded-full pulse-dot [animation-delay:200ms]" />
                      <span className="w-1.5 h-1.5 bg-[#A17D2F] rounded-full pulse-dot [animation-delay:400ms]" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center min-h-full px-4 py-20 sm:py-24">
              <h1 className="text-[28px] sm:text-[36px] font-serif text-[#1C1B18] mb-2 text-center leading-tight">
                Your wealth. Your terms.
              </h1>
              <p className="text-[15px] text-[#9C9B93] mb-10 text-center max-w-xs">
                Pick your store of value. Everything you receive auto-converts at 0.01% fees.
              </p>

              {address ? (
                <div className="w-full max-w-[400px] space-y-3">
                  <p className="text-[11px] font-medium tracking-wider uppercase text-[#9C9B93] px-1">
                    I want to hold
                  </p>
                  <div className="flex gap-2">
                    {STORE_OF_VALUE_OPTIONS.map((opt) => (
                      <button
                        key={opt.label}
                        onClick={() => handleQuickAction(opt.message, `Hold ${opt.label}`)}
                        className="flex-1 py-3.5 rounded-2xl bg-[#1C1B18] hover:bg-[#2D2C28] transition-all cursor-pointer text-center"
                      >
                        <span className="text-[15px] font-semibold text-[#F8F7F4]">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => handleQuickAction('Consolidate my tokens', 'Consolidate tokens')}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-[#E4E2DC] bg-white hover:border-[#C9C7BF] transition-all cursor-pointer"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#9C9B93]">
                      <path d="M12 5V19M12 5L6 11M12 5L18 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="text-[13px] font-medium text-[#6B6A63]">Consolidate existing tokens</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <ConnectButton />
                  <p className="text-[13px] text-[#9C9B93]">Connect your wallet to get started</p>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input bar — only visible after first interaction */}
      {hasMessages && (
        <div className="border-t border-[#E4E2DC] bg-white">
          <form
            onSubmit={handleSubmit}
            className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={input.startsWith('Pay ') ? 'Pay name.eth amount USDC' : 'What do you want to do?'}
              disabled={isLoading}
              className="flex-1 bg-[#F8F7F4] border-[#E4E2DC] text-[#1C1B18] placeholder:text-[#9C9B93] h-11 rounded-lg focus-visible:ring-2 focus-visible:ring-[#A17D2F]/20 focus-visible:border-[#A17D2F] transition-colors"
            />
            <Button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="h-11 px-6 bg-[#1C1B18] hover:bg-[#2D2C28] text-[#F8F7F4] rounded-lg font-medium disabled:opacity-30 cursor-pointer shadow-md shadow-[#1C1B18]/10 hover:shadow-lg hover:shadow-[#1C1B18]/15 transition-all"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#A17D2F]/30 border-t-[#A17D2F] rounded-full animate-spin" />
                </span>
              ) : (
                'Send'
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}

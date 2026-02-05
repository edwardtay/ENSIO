'use client'

import { useState, useCallback } from 'react'
import { useAccount, useSignTypedData, usePublicClient } from 'wagmi'
import type { Address } from 'viem'
import {
  generatePermitData,
  executeGaslessPayment,
  getTaskStatus,
  estimateRelayFee,
  PERMIT2_DOMAIN,
  PERMIT_TRANSFER_FROM_TYPES,
} from '@/lib/gasless/gelato-relay'

// Permit2 contract for nonce lookup
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3'
const PERMIT2_ABI = [
  {
    name: 'allowance',
    type: 'function',
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
] as const

export type GaslessPaymentStatus =
  | 'idle'
  | 'estimating'
  | 'signing'
  | 'submitting'
  | 'pending'
  | 'success'
  | 'error'

export interface UseGaslessPaymentResult {
  status: GaslessPaymentStatus
  error: string | null
  taskId: string | null
  estimatedFee: bigint | null
  /** Estimate the Gelato relay fee */
  estimate: () => Promise<bigint>
  /** Execute gasless payment (sign + submit) */
  execute: (params: {
    recipient: Address
    amount: bigint
    token?: Address
    vault?: Address
  }) => Promise<string>
  /** Check status of submitted task */
  checkStatus: () => Promise<void>
  reset: () => void
}

/**
 * Hook for gasless payments via Gelato Relay
 *
 * Usage:
 * ```tsx
 * const { execute, status, estimatedFee } = useGaslessPayment()
 *
 * // User clicks pay
 * await execute({
 *   recipient: '0x...',
 *   amount: 1000000n, // 1 USDC
 *   vault: '0x...', // optional vault for auto-deposit
 * })
 * ```
 */
export function useGaslessPayment(): UseGaslessPaymentResult {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { signTypedDataAsync } = useSignTypedData()

  const [status, setStatus] = useState<GaslessPaymentStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [estimatedFee, setEstimatedFee] = useState<bigint | null>(null)

  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
    setTaskId(null)
  }, [])

  const estimate = useCallback(async () => {
    setStatus('estimating')
    try {
      const fee = await estimateRelayFee()
      setEstimatedFee(fee)
      setStatus('idle')
      return fee
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to estimate fee')
      setStatus('error')
      throw err
    }
  }, [])

  const execute = useCallback(
    async (params: {
      recipient: Address
      amount: bigint
      token?: Address
      vault?: Address
    }) => {
      if (!address || !publicClient) {
        throw new Error('Wallet not connected')
      }

      setStatus('estimating')
      setError(null)

      try {
        // Get current nonce from Permit2
        const spender = '0x38CD83c6E690526770962A7A912D1CCAF6070EA4' as Address // GaslessPaymentRouter
        const token = params.token || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // USDC Base

        let nonce = BigInt(0)
        try {
          const result = await publicClient.readContract({
            address: PERMIT2_ADDRESS,
            abi: PERMIT2_ABI,
            functionName: 'allowance',
            args: [address, token, spender],
          }) as [bigint, bigint, bigint]
          nonce = BigInt(result[2])
        } catch {
          // First time using Permit2, nonce is 0
          nonce = BigInt(0)
        }

        // Generate permit data for signing
        const permitData = await generatePermitData(
          {
            payer: address,
            recipient: params.recipient,
            amount: params.amount,
            token: params.token,
            vault: params.vault,
          },
          nonce
        )

        // Request signature from user (gasless!)
        setStatus('signing')
        const signature = await signTypedDataAsync({
          domain: permitData.domain,
          types: permitData.types,
          primaryType: permitData.primaryType,
          message: permitData.message,
        })

        // Submit to Gelato relay network
        setStatus('submitting')
        const result = await executeGaslessPayment(
          {
            payer: address,
            recipient: params.recipient,
            amount: params.amount,
            token: params.token,
            vault: params.vault,
          },
          signature as `0x${string}`,
          nonce
        )

        setTaskId(result.taskId)
        setStatus('pending')

        return result.taskId
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Payment failed'
        setError(message)
        setStatus('error')
        throw err
      }
    },
    [address, publicClient, signTypedDataAsync]
  )

  const checkStatus = useCallback(async () => {
    if (!taskId) return

    try {
      const result = await getTaskStatus(taskId)

      if (result?.taskState === 'ExecSuccess') {
        setStatus('success')
      } else if (result?.taskState === 'Cancelled' || result?.taskState === 'ExecReverted') {
        setError(result.lastCheckMessage || 'Task failed')
        setStatus('error')
      }
      // Otherwise still pending
    } catch (err) {
      console.error('Failed to check task status:', err)
    }
  }, [taskId])

  return {
    status,
    error,
    taskId,
    estimatedFee,
    estimate,
    execute,
    checkStatus,
    reset,
  }
}

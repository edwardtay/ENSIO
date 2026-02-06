'use client'

import { useState, useCallback } from 'react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { type Address, encodeFunctionData } from 'viem'
import { base } from 'viem/chains'

// GasTankRegistry contract on Base
export const GAS_TANK_REGISTRY = '0xB3ce7C226BF75B470B916C2385bB5FF714c3D757' as Address

// Permit2 contract
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address

// USDC on Base
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address

// EIP-712 domain for Permit2
const PERMIT2_DOMAIN = {
  name: 'Permit2',
  chainId: 8453,
  verifyingContract: PERMIT2,
} as const

const PERMIT_TRANSFER_FROM_TYPES = {
  PermitTransferFrom: [
    { name: 'permitted', type: 'TokenPermissions' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  TokenPermissions: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
} as const

const GAS_TANK_ABI = [
  {
    name: 'executePayment',
    type: 'function',
    inputs: [
      {
        name: 'permit',
        type: 'tuple',
        components: [
          {
            name: 'permitted',
            type: 'tuple',
            components: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      { name: 'payer', type: 'address' },
      { name: 'signature', type: 'bytes' },
      { name: 'receiver', type: 'address' },
      { name: 'vault', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'executeSimplePayment',
    type: 'function',
    inputs: [
      {
        name: 'permit',
        type: 'tuple',
        components: [
          {
            name: 'permitted',
            type: 'tuple',
            components: [
              { name: 'token', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
          },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      { name: 'payer', type: 'address' },
      { name: 'signature', type: 'bytes' },
      { name: 'receiver', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'canReceivePayments',
    type: 'function',
    inputs: [{ name: 'receiver', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const

export type PaymentStatus =
  | 'idle'
  | 'checking'
  | 'signing'
  | 'executing'
  | 'success'
  | 'error'

export interface UseGasTankPaymentResult {
  status: PaymentStatus
  error: string | null
  txHash: string | null
  canReceiverAccept: boolean | null
  checkReceiver: (receiver: Address) => Promise<boolean>
  executePayment: (params: {
    receiver: Address
    amount: bigint
    vault?: Address
  }) => Promise<void>
  reset: () => void
}

export function useGasTankPayment(): UseGasTankPaymentResult {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient({ chainId: base.id })

  const [status, setStatus] = useState<PaymentStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [canReceiverAccept, setCanReceiverAccept] = useState<boolean | null>(
    null
  )

  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
    setTxHash(null)
  }, [])

  // Check if receiver can accept payments (has gas tank balance)
  const checkReceiver = useCallback(
    async (receiver: Address): Promise<boolean> => {
      if (!publicClient) return false

      try {
        setStatus('checking')
        const canReceive = await publicClient.readContract({
          address: GAS_TANK_REGISTRY,
          abi: GAS_TANK_ABI,
          functionName: 'canReceivePayments',
          args: [receiver],
        })
        setCanReceiverAccept(canReceive as boolean)
        setStatus('idle')
        return canReceive as boolean
      } catch {
        setCanReceiverAccept(false)
        setStatus('idle')
        return false
      }
    },
    [publicClient]
  )

  // Execute payment via gas tank
  const executePayment = useCallback(
    async (params: { receiver: Address; amount: bigint; vault?: Address }) => {
      if (!address || !walletClient || !publicClient) {
        setError('Wallet not connected')
        return
      }

      try {
        setStatus('signing')
        setError(null)

        // Generate nonce (use timestamp-based for simplicity)
        const nonce = BigInt(Date.now())
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60) // 30 min

        // Create permit message
        const permitMessage = {
          permitted: {
            token: USDC_BASE,
            amount: params.amount,
          },
          spender: GAS_TANK_REGISTRY,
          nonce,
          deadline,
        }

        // Sign the permit
        const signature = await walletClient.signTypedData({
          domain: PERMIT2_DOMAIN,
          types: PERMIT_TRANSFER_FROM_TYPES,
          primaryType: 'PermitTransferFrom',
          message: permitMessage,
        })

        setStatus('executing')

        // Build the transaction to call GasTank
        const permit = {
          permitted: {
            token: USDC_BASE,
            amount: params.amount,
          },
          nonce,
          deadline,
        }

        // Encode the function call
        const functionName = params.vault ? 'executePayment' : 'executeSimplePayment'
        const args = params.vault
          ? [permit, address, signature, params.receiver, params.vault]
          : [permit, address, signature, params.receiver]

        const data = encodeFunctionData({
          abi: GAS_TANK_ABI,
          functionName,
          args: args as unknown[],
        })

        // Send transaction (anyone can call - gas paid from receiver's tank)
        const hash = await walletClient.sendTransaction({
          to: GAS_TANK_REGISTRY,
          data,
          chain: base,
        })

        setTxHash(hash)
        setStatus('success')
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Payment failed'
        setError(message)
        setStatus('error')
      }
    },
    [address, walletClient, publicClient]
  )

  return {
    status,
    error,
    txHash,
    canReceiverAccept,
    checkReceiver,
    executePayment,
    reset,
  }
}

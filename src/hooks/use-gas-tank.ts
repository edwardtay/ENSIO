'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { parseEther, formatEther, type Address } from 'viem'
import { base } from 'viem/chains'

// GasTankRegistry contract address on Base
export const GAS_TANK_REGISTRY = '0xB3ce7C226BF75B470B916C2385bB5FF714c3D757' as Address

const GAS_TANK_ABI = [
  {
    name: 'deposit',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    name: 'withdraw',
    type: 'function',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'setDefaultVault',
    type: 'function',
    inputs: [{ name: 'vault', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'gasTanks',
    type: 'function',
    inputs: [{ name: 'receiver', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'defaultVaults',
    type: 'function',
    inputs: [{ name: 'receiver', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'getTankStatus',
    type: 'function',
    inputs: [{ name: 'receiver', type: 'address' }],
    outputs: [
      { name: 'balance', type: 'uint256' },
      { name: 'estimatedPayments', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'canReceivePayments',
    type: 'function',
    inputs: [{ name: 'receiver', type: 'address' }],
    outputs: [{ name: 'canReceive', type: 'bool' }],
    stateMutability: 'view',
  },
] as const

export interface GasTankStatus {
  balance: string
  balanceWei: bigint
  estimatedPayments: number
  canReceive: boolean
  defaultVault: Address | null
}

export interface UseGasTankResult {
  status: GasTankStatus | null
  loading: boolean
  error: string | null
  deposit: (amountEth: string) => Promise<void>
  withdraw: (amountEth: string) => Promise<void>
  setDefaultVault: (vault: Address) => Promise<void>
  refresh: () => void
  txPending: boolean
}

export function useGasTank(): UseGasTankResult {
  const { address } = useAccount()
  const [error, setError] = useState<string | null>(null)

  // Read tank balance
  const {
    data: tankBalance,
    isLoading: balanceLoading,
    refetch: refetchBalance,
  } = useReadContract({
    address: GAS_TANK_REGISTRY,
    abi: GAS_TANK_ABI,
    functionName: 'gasTanks',
    args: address ? [address] : undefined,
    chainId: base.id,
    query: {
      enabled: !!address && GAS_TANK_REGISTRY !== '0x0000000000000000000000000000000000000000',
    },
  })

  // Read tank status (balance + estimated payments)
  const { data: tankStatus, refetch: refetchStatus } = useReadContract({
    address: GAS_TANK_REGISTRY,
    abi: GAS_TANK_ABI,
    functionName: 'getTankStatus',
    args: address ? [address] : undefined,
    chainId: base.id,
    query: {
      enabled: !!address && GAS_TANK_REGISTRY !== '0x0000000000000000000000000000000000000000',
    },
  })

  // Read default vault
  const { data: defaultVault, refetch: refetchVault } = useReadContract({
    address: GAS_TANK_REGISTRY,
    abi: GAS_TANK_ABI,
    functionName: 'defaultVaults',
    args: address ? [address] : undefined,
    chainId: base.id,
    query: {
      enabled: !!address && GAS_TANK_REGISTRY !== '0x0000000000000000000000000000000000000000',
    },
  })

  // Read can receive
  const { data: canReceive } = useReadContract({
    address: GAS_TANK_REGISTRY,
    abi: GAS_TANK_ABI,
    functionName: 'canReceivePayments',
    args: address ? [address] : undefined,
    chainId: base.id,
    query: {
      enabled: !!address && GAS_TANK_REGISTRY !== '0x0000000000000000000000000000000000000000',
    },
  })

  // Write functions
  const { writeContractAsync, isPending: writePending, data: txHash } = useWriteContract()

  const { isLoading: txConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  const txPending = writePending || txConfirming

  // Refresh all data
  const refresh = useCallback(() => {
    refetchBalance()
    refetchStatus()
    refetchVault()
  }, [refetchBalance, refetchStatus, refetchVault])

  // Deposit to tank
  const deposit = useCallback(
    async (amountEth: string) => {
      if (!address) {
        setError('Wallet not connected')
        return
      }

      try {
        setError(null)
        await writeContractAsync({
          address: GAS_TANK_REGISTRY,
          abi: GAS_TANK_ABI,
          functionName: 'deposit',
          value: parseEther(amountEth),
          chainId: base.id,
        })
        // Refresh after tx confirms
        setTimeout(refresh, 2000)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Deposit failed')
      }
    },
    [address, writeContractAsync, refresh]
  )

  // Withdraw from tank
  const withdraw = useCallback(
    async (amountEth: string) => {
      if (!address) {
        setError('Wallet not connected')
        return
      }

      try {
        setError(null)
        await writeContractAsync({
          address: GAS_TANK_REGISTRY,
          abi: GAS_TANK_ABI,
          functionName: 'withdraw',
          args: [parseEther(amountEth)],
          chainId: base.id,
        })
        setTimeout(refresh, 2000)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Withdraw failed')
      }
    },
    [address, writeContractAsync, refresh]
  )

  // Set default vault
  const setDefaultVaultFn = useCallback(
    async (vault: Address) => {
      if (!address) {
        setError('Wallet not connected')
        return
      }

      try {
        setError(null)
        await writeContractAsync({
          address: GAS_TANK_REGISTRY,
          abi: GAS_TANK_ABI,
          functionName: 'setDefaultVault',
          args: [vault],
          chainId: base.id,
        })
        setTimeout(refresh, 2000)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to set vault')
      }
    },
    [address, writeContractAsync, refresh]
  )

  // Build status object
  const status: GasTankStatus | null =
    tankBalance !== undefined
      ? {
          balance: formatEther(tankBalance as bigint),
          balanceWei: tankBalance as bigint,
          estimatedPayments: tankStatus
            ? Number((tankStatus as [bigint, bigint])[1])
            : 0,
          canReceive: canReceive as boolean ?? false,
          defaultVault:
            defaultVault && defaultVault !== '0x0000000000000000000000000000000000000000'
              ? (defaultVault as Address)
              : null,
        }
      : null

  return {
    status,
    loading: balanceLoading,
    error,
    deposit,
    withdraw,
    setDefaultVault: setDefaultVaultFn,
    refresh,
    txPending,
  }
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount, useSendTransaction, useSwitchChain } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

// Risk tiers for vault categorization
type RiskTier = 'low' | 'medium' | 'high'

// Vault options with their underlying token and risk tier
const VAULT_OPTIONS = [
  // Low Risk - Blue Chip Lenders
  {
    id: 'aave-usdc',
    address: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB',
    name: 'Aave USDC',
    token: 'USDC',
    protocol: 'Aave v3',
    chain: 'Base',
    risk: 'low' as RiskTier,
    description: 'Battle-tested lending protocol',
  },
  {
    id: 'moonwell-usdc',
    address: '0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca',
    name: 'Moonwell USDC',
    token: 'USDC',
    protocol: 'Moonwell',
    chain: 'Base',
    risk: 'low' as RiskTier,
    description: 'Leading Base-native lender',
  },
  // Medium Risk - Morpho Curated Vaults
  {
    id: 'gauntlet-prime',
    address: '0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61',
    name: 'Gauntlet Prime',
    token: 'USDC',
    protocol: 'Morpho · Gauntlet',
    chain: 'Base',
    risk: 'medium' as RiskTier,
    description: 'Curated by Gauntlet risk team',
  },
  {
    id: 'seamless-usdc',
    address: '0x616a4E1db48e22028f6bbf20444Cd3b8e3273738',
    name: 'Seamless USDC',
    token: 'USDC',
    protocol: 'Morpho · Seamless',
    chain: 'Base',
    risk: 'medium' as RiskTier,
    description: 'Seamless Protocol vault',
  },
  {
    id: 'spark-usdc',
    address: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
    name: 'Spark USDC',
    token: 'USDC',
    protocol: 'Morpho · Spark',
    chain: 'Base',
    risk: 'medium' as RiskTier,
    description: 'MakerDAO ecosystem vault',
  },
  // Higher Risk - Aggressive Strategies
  {
    id: 'gauntlet-frontier',
    address: '0x236919F11ff9eA9550A4287696C2FC9e18E6e890',
    name: 'Gauntlet Frontier',
    token: 'USDC',
    protocol: 'Morpho · Gauntlet',
    chain: 'Base',
    risk: 'high' as RiskTier,
    description: 'Higher yield, newer markets',
  },
  {
    id: 'steakhouse-rwa',
    address: '0xbEefc4aDBE58173FCa2C042097Fe33095E68C3D6',
    name: 'Steakhouse RWA',
    token: 'USDC',
    protocol: 'Morpho · Steakhouse',
    chain: 'Base',
    risk: 'high' as RiskTier,
    description: 'Real-world asset exposure',
  },
  {
    id: 're7-rwa',
    address: '0x6e37C95b43566E538D8C278eb69B00FC717a001b',
    name: 'Re7 RWA',
    token: 'USDC',
    protocol: 'Morpho · Re7',
    chain: 'Base',
    risk: 'high' as RiskTier,
    description: 'RWA-backed yields',
  },
  // No Yield Option
  {
    id: 'none',
    address: '',
    name: 'No Yield',
    token: 'USDC',
    protocol: 'Direct to wallet',
    chain: 'Base',
    risk: 'low' as RiskTier,
    description: 'Keep USDC liquid',
  },
] as const

type VaultAllocation = {
  vault: string
  percentage: number
}

type SmartVaultConfig = {
  allocations: VaultAllocation[]
  conditionalRoutingEnabled: boolean
  conditionalVaults: string[]
}

type SmartVaultReceipt = {
  id: string
  sender: string
  token: string
  tokenSymbol: string
  amount: string
  timestamp: string
  deposits: { vault: string; amount: string; shares: string }[]
  nftId: string
}

type VaultPosition = {
  shares: string
  assets: string
  apy: string
  earned: string
}

type Receipt = {
  txHash: string
  amount: string
  token: string
  chain: string
  from: string
  createdAt: string
}

function useEnsName(address?: string) {
  const [name, setName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!address) {
      setName(null)
      return
    }

    setLoading(true)
    fetch(`/api/ens/primary-name?address=${address}&chainId=1`)
      .then((r) => r.json())
      .then((data) => setName(data.name ?? null))
      .catch(() => setName(null))
      .finally(() => setLoading(false))
  }, [address])

  return { name, loading }
}

function useEnsPreferences(ensName: string | null) {
  const [vault, setVault] = useState<string | null>(null)
  const [strategy, setStrategy] = useState<string | null>(null)
  const [strategies, setStrategies] = useState<string | null>(null)
  const [avatar, setAvatar] = useState<string | null>(null)
  const [description, setDescription] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!ensName) {
      setVault(null)
      setStrategy(null)
      setStrategies(null)
      setAvatar(null)
      setDescription(null)
      return
    }

    setLoading(true)
    fetch(`/api/ens/resolve?name=${encodeURIComponent(ensName)}`)
      .then((r) => r.json())
      .then((data) => {
        setVault(data.yieldVault ?? null)
        setStrategy(data.strategy ?? null)
        setStrategies(data.strategies ?? null)
        setDescription(data.description ?? null)
        // Convert IPFS URL to HTTP gateway
        if (data.avatar) {
          const avatarUrl = data.avatar.startsWith('ipfs://')
            ? `https://ipfs.io/ipfs/${data.avatar.slice(7)}`
            : data.avatar
          setAvatar(avatarUrl)
        }
      })
      .catch(() => {
        setVault(null)
        setStrategy(null)
        setStrategies(null)
        setAvatar(null)
        setDescription(null)
      })
      .finally(() => setLoading(false))
  }, [ensName])

  return { vault, strategy, strategies, avatar, description, loading }
}

function useReceipts(address?: string) {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!address) {
      setReceipts([])
      return
    }

    setLoading(true)
    fetch(`/api/ens/receipts?recipient=${address}`)
      .then((r) => r.json())
      .then((data) => setReceipts(data.receipts ?? []))
      .catch(() => setReceipts([]))
      .finally(() => setLoading(false))
  }, [address])

  return { receipts, loading }
}

function useVaultPosition(vaultAddress?: string, userAddress?: string) {
  const [position, setPosition] = useState<VaultPosition | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!vaultAddress || !userAddress) {
      setPosition(null)
      return
    }

    setLoading(true)
    fetch(`/api/vault/position?user=${userAddress}&vault=${vaultAddress}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setPosition(null)
        } else {
          setPosition(data)
        }
      })
      .catch(() => setPosition(null))
      .finally(() => setLoading(false))
  }, [vaultAddress, userAddress])

  return { position, loading }
}

// Fetch APY for all vaults on mount
function useVaultApys() {
  const [apys, setApys] = useState<Record<string, string>>({})

  useEffect(() => {
    // Fetch APY for each vault
    VAULT_OPTIONS.forEach(async (vault) => {
      if (vault.id === 'none' || !vault.address) return
      try {
        const res = await fetch(`/api/vault/position?user=0x0000000000000000000000000000000000000000&vault=${vault.address}`)
        const data = await res.json()
        if (data.apy) {
          setApys(prev => ({ ...prev, [vault.id]: data.apy }))
        }
      } catch {
        // Keep default
      }
    })
  }, [])

  return apys
}

function useSmartVaultConfig(address?: string) {
  const [config, setConfig] = useState<SmartVaultConfig | null>(null)
  const [loading, setLoading] = useState(false)

  const refetch = useCallback(() => {
    if (!address) {
      setConfig(null)
      return
    }

    setLoading(true)
    fetch(`/api/smart-vault/config?recipient=${address}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setConfig(data)
        } else {
          setConfig(null)
        }
      })
      .catch(() => setConfig(null))
      .finally(() => setLoading(false))
  }, [address])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { config, loading, refetch }
}

function useSmartVaultReceipts(address?: string) {
  const [receipts, setReceipts] = useState<SmartVaultReceipt[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!address) {
      setReceipts([])
      return
    }

    setLoading(true)
    fetch(`/api/smart-vault/receipts?recipient=${address}`)
      .then((r) => r.json())
      .then((data) => setReceipts(data.receipts ?? []))
      .catch(() => setReceipts([]))
      .finally(() => setLoading(false))
  }, [address])

  return { receipts, loading }
}

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ReceiverDashboard() {
  const { address, isConnected, chainId } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const { switchChainAsync } = useSwitchChain()
  const { name: ensName, loading: ensLoading } = useEnsName(address)
  const { vault: currentVault, strategy: currentStrategy, strategies: currentStrategies, avatar: ensAvatar, description: ensDescription, loading: prefsLoading } = useEnsPreferences(ensName)
  const { receipts, loading: receiptsLoading } = useReceipts(address)
  const vaultApys = useVaultApys()
  const { position: vaultPosition, loading: positionLoading } = useVaultPosition(currentVault ?? undefined, address)
  const { config: smartVaultConfig, loading: configLoading, refetch: refetchConfig } = useSmartVaultConfig(address)
  const { receipts: smartVaultReceipts, loading: smartReceiptsLoading } = useSmartVaultReceipts(address)

  const [selectedVaultId, setSelectedVaultId] = useState<string>('')
  const [customVault, setCustomVault] = useState('')
  const [selectedStrategy, setSelectedStrategy] = useState<string>('yield')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveTxHash, setSaveTxHash] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [requestAmount, setRequestAmount] = useState('')

  // Multi-vault allocation state
  const [useMultiVault, setUseMultiVault] = useState(false)
  const [multiVaultAllocations, setMultiVaultAllocations] = useState<{ vault: typeof VAULT_OPTIONS[number]; percentage: number }[]>([
    { vault: VAULT_OPTIONS[0], percentage: 50 },
    { vault: VAULT_OPTIONS[1], percentage: 50 },
  ])
  const [useConditionalRouting, setUseConditionalRouting] = useState(false)
  const [savingMultiVault, setSavingMultiVault] = useState(false)
  const [multiVaultSuccess, setMultiVaultSuccess] = useState(false)
  const [multiVaultError, setMultiVaultError] = useState<string | null>(null)
  const [multiVaultTxHash, setMultiVaultTxHash] = useState<string | null>(null)

  // State for showing advanced options (collapsed by default for first-time users)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Sync multi-vault state with on-chain config
  useEffect(() => {
    if (smartVaultConfig && smartVaultConfig.allocations.length > 0) {
      setUseMultiVault(true)
      const allocs = smartVaultConfig.allocations.map((a) => {
        const vaultOption = VAULT_OPTIONS.find(v => v.address.toLowerCase() === a.vault.toLowerCase())
        return {
          vault: vaultOption ?? VAULT_OPTIONS[0],
          percentage: a.percentage,
        }
      })
      setMultiVaultAllocations(allocs)
    }
    if (smartVaultConfig?.conditionalRoutingEnabled) {
      setUseConditionalRouting(true)
    }
  }, [smartVaultConfig])

  // Sync selected vault with loaded preference
  useEffect(() => {
    if (currentVault && !selectedVaultId) {
      const found = VAULT_OPTIONS.find(v => v.address.toLowerCase() === currentVault.toLowerCase())
      if (found) {
        setSelectedVaultId(found.id)
      } else if (currentVault) {
        setSelectedVaultId('custom')
        setCustomVault(currentVault)
      }
    }
  }, [currentVault, selectedVaultId])

  // Sync selected strategy with loaded preference
  useEffect(() => {
    if (currentStrategy) {
      setSelectedStrategy(currentStrategy)
    }
  }, [currentStrategy])

  // Sync multi-strategy allocation with ENS record
  useEffect(() => {
    if (currentStrategies) {
      setUseMultiStrategy(true)
      const parts = currentStrategies.split(',')
      const allocs: { strategy: 'yield' | 'restaking' | 'liquid'; percentage: number }[] = []
      for (const part of parts) {
        const [strategyType, percentStr] = part.split(':').map(s => s.trim())
        const percentage = parseInt(percentStr, 10)
        if (['yield', 'restaking', 'liquid'].includes(strategyType.toLowerCase()) && !isNaN(percentage)) {
          allocs.push({
            strategy: strategyType.toLowerCase() as 'yield' | 'restaking' | 'liquid',
            percentage,
          })
        }
      }
      if (allocs.length > 0) {
        setStrategyAllocations(allocs)
      }
    }
  }, [currentStrategies])

  const selectedVault = VAULT_OPTIONS.find(v => v.id === selectedVaultId)
  const vaultAddress = selectedVaultId === 'custom' ? customVault : selectedVault?.address || ''

  // Check if vault changed from current
  const vaultChanged = currentVault
    ? vaultAddress.toLowerCase() !== currentVault.toLowerCase()
    : vaultAddress !== ''

  // Check if strategy changed from current
  const strategyChanged = currentStrategy
    ? selectedStrategy.toLowerCase() !== currentStrategy.toLowerCase()
    : selectedStrategy !== 'yield' // Default is yield, so only changed if not yield

  // Strategy saving state
  const [savingStrategy, setSavingStrategy] = useState(false)
  const [strategySuccess, setStrategySuccess] = useState(false)

  // Multi-strategy allocation state (ENS-based)
  const [useMultiStrategy, setUseMultiStrategy] = useState(false)
  const [strategyAllocations, setStrategyAllocations] = useState<{ strategy: 'yield' | 'restaking' | 'liquid'; percentage: number }[]>([
    { strategy: 'yield', percentage: 50 },
    { strategy: 'restaking', percentage: 50 },
  ])
  const [strategyTxHash, setStrategyTxHash] = useState<string | null>(null)
  const [strategyError, setStrategyError] = useState<string | null>(null)

  const handleSaveStrategy = async () => {
    if (!ensName) return

    setSavingStrategy(true)
    setStrategySuccess(false)
    setStrategyTxHash(null)
    setStrategyError(null)

    try {
      // Switch to mainnet if needed (ENS is on mainnet)
      if (chainId !== 1) {
        await switchChainAsync({ chainId: 1 })
      }

      // If yield strategy and vault is set, save both together
      const body: { ensName: string; strategy: string; vaultAddress?: string } = {
        ensName,
        strategy: selectedStrategy,
      }

      // Include vault address if yield strategy and vault is configured
      if (selectedStrategy === 'yield' && vaultAddress && selectedVaultId !== 'none') {
        body.vaultAddress = vaultAddress
      }

      const res = await fetch('/api/ens/set-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to prepare transaction')
      }

      const txData = await res.json()

      const hash = await sendTransactionAsync({
        to: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        value: BigInt(txData.value || 0),
      })

      setStrategyTxHash(hash)
      setStrategySuccess(true)
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Transaction failed'
      if (/rejected|denied|user refused/i.test(errMessage)) {
        setStrategyError('Transaction rejected')
      } else {
        setStrategyError(errMessage)
      }
    } finally {
      setSavingStrategy(false)
    }
  }

  // Calculate multi-strategy total
  const strategyAllocationTotal = strategyAllocations.reduce((sum, a) => sum + a.percentage, 0)

  // Format strategies string for ENS
  const formatStrategiesForENS = () => {
    return strategyAllocations
      .filter(a => a.percentage > 0)
      .map(a => `${a.strategy}:${a.percentage}`)
      .join(',')
  }

  // Check if multi-strategy changed from current ENS record
  const multiStrategyChanged = useMultiStrategy && (
    !currentStrategies || formatStrategiesForENS() !== currentStrategies
  )

  const handleSaveMultiStrategy = async () => {
    if (!ensName || strategyAllocationTotal !== 100) return

    setSavingStrategy(true)
    setStrategySuccess(false)
    setStrategyTxHash(null)
    setStrategyError(null)

    try {
      // Switch to mainnet if needed (ENS is on mainnet)
      if (chainId !== 1) {
        await switchChainAsync({ chainId: 1 })
      }

      const strategiesStr = formatStrategiesForENS()

      const res = await fetch('/api/ens/set-strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ensName,
          strategies: strategiesStr,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to prepare transaction')
      }

      const txData = await res.json()

      const hash = await sendTransactionAsync({
        to: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        value: BigInt(txData.value || 0),
      })

      setStrategyTxHash(hash)
      setStrategySuccess(true)
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Transaction failed'
      if (/rejected|denied|user refused/i.test(errMessage)) {
        setStrategyError('Transaction rejected')
      } else {
        setStrategyError(errMessage)
      }
    } finally {
      setSavingStrategy(false)
    }
  }

  const updateStrategyAllocation = (index: number, percentage: number) => {
    setStrategyAllocations(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], percentage }
      return updated
    })
  }

  const addStrategyAllocation = () => {
    const usedStrategies = strategyAllocations.map(a => a.strategy)
    const availableStrategies = (['yield', 'restaking', 'liquid'] as const).filter(s => !usedStrategies.includes(s))
    if (availableStrategies.length > 0) {
      setStrategyAllocations(prev => [...prev, { strategy: availableStrategies[0], percentage: 0 }])
    }
  }

  const removeStrategyAllocation = (index: number) => {
    setStrategyAllocations(prev => prev.filter((_, i) => i !== index))
  }

  const handleSaveVault = async () => {
    if (!vaultAddress || !ensName || selectedVaultId === 'none') return

    setSaving(true)
    setSaveSuccess(false)
    setSaveTxHash(null)
    setSaveError(null)

    try {
      // Switch to mainnet if needed (ENS is on mainnet)
      if (chainId !== 1) {
        await switchChainAsync({ chainId: 1 })
      }

      const res = await fetch('/api/ens/set-vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ensName, vaultAddress }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to prepare transaction')
      }

      const txData = await res.json()

      const hash = await sendTransactionAsync({
        to: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        value: BigInt(txData.value || 0),
      })

      setSaveTxHash(hash)
      setSaveSuccess(true)
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Transaction failed'
      if (/rejected|denied|user refused/i.test(errMessage)) {
        setSaveError('Transaction rejected')
      } else {
        setSaveError(errMessage)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = () => {
    const base = `${window.location.origin}/pay/${ensName}`
    const link = requestAmount ? `${base}?amount=${requestAmount}` : base
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveMultiVault = async () => {
    if (multiVaultAllocations.length === 0) return

    setSavingMultiVault(true)
    setMultiVaultSuccess(false)
    setMultiVaultError(null)
    setMultiVaultTxHash(null)

    try {
      // Switch to Base if needed
      if (chainId !== 8453) {
        await switchChainAsync({ chainId: 8453 })
      }

      // Build the allocation data
      const vaults = multiVaultAllocations.map(a => a.vault.address)
      const allocations = multiVaultAllocations.map(a => a.percentage)

      const res = await fetch('/api/smart-vault/set-allocation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setAllocation', vaults, allocations }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to prepare transaction')
      }

      const txData = await res.json()

      const hash = await sendTransactionAsync({
        to: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        value: BigInt(txData.value || 0),
        chainId: 8453,
      })

      setMultiVaultTxHash(hash)
      setMultiVaultSuccess(true)
      refetchConfig()
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Transaction failed'
      if (/rejected|denied|user refused/i.test(errMessage)) {
        setMultiVaultError('Transaction rejected')
      } else {
        setMultiVaultError(errMessage)
      }
    } finally {
      setSavingMultiVault(false)
    }
  }

  const handleToggleConditionalRouting = async () => {
    setSavingMultiVault(true)
    setMultiVaultError(null)

    try {
      // Switch to Base if needed
      if (chainId !== 8453) {
        await switchChainAsync({ chainId: 8453 })
      }

      const action = useConditionalRouting ? 'disableConditional' : 'enableConditional'
      const vaults = useConditionalRouting ? undefined : VAULT_OPTIONS.filter(v => v.id !== 'none').map(v => v.address)

      const res = await fetch('/api/smart-vault/set-allocation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, vaults }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to prepare transaction')
      }

      const txData = await res.json()

      const hash = await sendTransactionAsync({
        to: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        value: BigInt(txData.value || 0),
        chainId: 8453,
      })

      setMultiVaultTxHash(hash)
      setUseConditionalRouting(!useConditionalRouting)
      refetchConfig()
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Transaction failed'
      if (/rejected|denied|user refused/i.test(errMessage)) {
        setMultiVaultError('Transaction rejected')
      } else {
        setMultiVaultError(errMessage)
      }
    } finally {
      setSavingMultiVault(false)
    }
  }

  const updateAllocation = (index: number, percentage: number) => {
    setMultiVaultAllocations(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], percentage }
      return updated
    })
  }

  const addVaultAllocation = () => {
    const unusedVault = VAULT_OPTIONS.find(v =>
      v.id !== 'none' && !multiVaultAllocations.some(a => a.vault.id === v.id)
    )
    if (unusedVault) {
      setMultiVaultAllocations(prev => [...prev, { vault: unusedVault, percentage: 0 }])
    }
  }

  const removeVaultAllocation = (index: number) => {
    setMultiVaultAllocations(prev => prev.filter((_, i) => i !== index))
  }

  const totalAllocation = multiVaultAllocations.reduce((sum, a) => sum + a.percentage, 0)

  // Calculate totals from receipts
  const totalReceived = receipts.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0)

  // Not connected
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
        <div className="w-20 h-20 mb-6 rounded-2xl bg-gradient-to-br from-[#1C1B18] to-[#3D3C38] flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-[#F8F7F4]">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="text-3xl font-semibold text-[#1C1B18] mb-3">Accept Any Token</h1>
        <p className="text-[#6B6960] mb-8 text-center max-w-md text-lg">
          Get paid in any token on any chain. Auto-convert to USDC and earn yield.
        </p>
        <ConnectButton />
      </div>
    )
  }

  // Loading
  if (ensLoading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="animate-spin w-8 h-8 border-2 border-[#1C1B18] border-t-transparent rounded-full" />
      </div>
    )
  }

  // No ENS
  if (!ensName) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
        <div className="w-20 h-20 mb-6 rounded-2xl bg-[#FFF3E0] flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-[#E65100]">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M12 8V12M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-[#1C1B18] mb-2">ENS Name Required</h1>
        <p className="text-[#6B6960] mb-6 text-center max-w-sm">
          Get an ENS name to create your payment link and configure yield settings.
        </p>
        <a
          href="https://app.ens.domains"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#1C1B18] text-white font-medium hover:bg-[#2D2C28] transition-colors"
        >
          Get ENS Name
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>
    )
  }

  const basePaymentLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/pay/${ensName}`
  const paymentLink = requestAmount ? `${basePaymentLink}?amount=${requestAmount}` : basePaymentLink

  // Determine current strategy display
  const currentStrategyDisplay = currentStrategies
    ? 'Multi-strategy'
    : currentStrategy === 'restaking'
    ? 'Restaking (Renzo)'
    : currentStrategy === 'liquid'
    ? 'Liquid USDC'
    : 'Yield (Aave)'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* HERO: Payment Link - The Main Action */}
      <Card className="border-[#E4E2DC] bg-white overflow-hidden">
        <div className="bg-gradient-to-br from-[#1C1B18] to-[#2D2C28] p-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            {ensAvatar ? (
              <img src={ensAvatar} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <span className="text-lg font-bold text-white">{ensName?.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <h1 className="text-2xl font-semibold text-white">{ensName}</h1>
          </div>
          <p className="text-white/70 text-sm">Share this link to get paid in any token</p>
        </div>

        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-6 items-center">
            {/* QR Code */}
            <div className="p-3 bg-white rounded-xl border border-[#E4E2DC] shadow-sm">
              <QRCodeSVG
                value={paymentLink}
                size={140}
                level="M"
                includeMargin={false}
                bgColor="#FFFFFF"
                fgColor="#1C1B18"
              />
            </div>

            {/* Link & Actions */}
            <div className="flex-1 w-full space-y-4">
              {/* Payment link display */}
              <div className="p-3 bg-[#F8F7F4] rounded-lg">
                <p className="text-xs text-[#6B6960] mb-1">Your payment link</p>
                <p className="font-mono text-sm text-[#1C1B18] break-all">{paymentLink}</p>
              </div>

              {/* Optional amount */}
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Amount (optional)"
                  value={requestAmount}
                  onChange={(e) => setRequestAmount(e.target.value)}
                  className="h-10 flex-1 border-[#E4E2DC] focus:border-[#1C1B18] focus:ring-[#1C1B18]"
                />
                <span className="text-sm text-[#6B6960] w-12">USDC</span>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  className="flex-1 border-[#E4E2DC] hover:bg-[#F8F7F4]"
                >
                  {copied ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mr-2 text-[#22C55E]">
                        <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mr-2">
                        <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/>
                        <path d="M5 15H4C2.89543 15 2 14.1046 2 13V4C2 2.89543 2.89543 2 4 2H13C14.1046 2 15 2.89543 15 4V5" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                      Copy Link
                    </>
                  )}
                </Button>
                <Button
                  onClick={async () => {
                    if (navigator.share) {
                      try {
                        await navigator.share({ title: `Pay ${ensName}`, url: paymentLink })
                      } catch {}
                    } else {
                      handleCopy()
                    }
                  }}
                  className="flex-1 bg-[#1C1B18] hover:bg-[#2D2C28] text-white"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mr-2">
                    <path d="M4 12V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M16 6L12 2L8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M12 2V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Share
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Simple Status Card - What happens to payments */}
      <Card className="border-[#E4E2DC] bg-white">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#EDF5F0] flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#22C55E]">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className="font-medium text-[#1C1B18]">Payments auto-convert to USDC</p>
                <p className="text-sm text-[#6B6960]">
                  {prefsLoading ? (
                    <span className="inline-block h-4 w-32 bg-[#E4E2DC] rounded animate-pulse" />
                  ) : currentVault || currentStrategy ? (
                    <>Earning yield via <span className="text-[#22C55E] font-medium">{currentStrategyDisplay}</span></>
                  ) : (
                    <>Will earn ~4% APY once configured</>
                  )}
                </p>
              </div>
            </div>
            {vaultPosition && parseFloat(vaultPosition.assets) > 0 && (
              <div className="text-right">
                <p className="text-lg font-semibold text-[#1C1B18]">${vaultPosition.assets}</p>
                <p className="text-xs text-[#22C55E]">+${vaultPosition.earned} earned</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Customize Button - Toggle Advanced Options */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-[#6B6960] hover:text-[#1C1B18] transition-colors"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
        >
          <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {showAdvanced ? 'Hide options' : 'Customize how you receive payments'}
      </button>

      {/* Advanced Options - Collapsed by Default */}
      {showAdvanced && (
        <div className="space-y-5 animate-in slide-in-from-top-2 duration-200">
          {/* ENS Profile Card - Simplified */}
          <Card className="border-[#E4E2DC] bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {ensAvatar ? (
                    <img src={ensAvatar} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#627EEA] to-[#C99FFF] flex items-center justify-center">
                      <span className="text-sm font-bold text-white">{ensName?.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-[#1C1B18]">{ensName}</p>
                    <p className="text-xs text-[#6B6960] font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</p>
                  </div>
                </div>
                <a
                  href={`https://app.ens.domains/${ensName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#627EEA] hover:underline"
                >
                  Edit on ENS →
                </a>
              </div>
            </CardContent>
          </Card>

          {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-[#E4E2DC] bg-white">
          <CardContent className="p-5">
            <p className="text-sm text-[#6B6960] mb-1">Vault Balance</p>
            {positionLoading ? (
              <div className="h-8 w-24 bg-[#F8F7F4] rounded animate-pulse" />
            ) : (
              <p className="text-2xl font-semibold text-[#1C1B18]">
                ${vaultPosition?.assets ?? '0.00'}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="border-[#E4E2DC] bg-white">
          <CardContent className="p-5">
            <p className="text-sm text-[#6B6960] mb-1">Yield Earned</p>
            {positionLoading ? (
              <div className="h-8 w-20 bg-[#F8F7F4] rounded animate-pulse" />
            ) : (
              <p className="text-2xl font-semibold text-[#22C55E]">
                +${vaultPosition?.earned ?? '0.00'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* DeFi Strategy Selection */}
      <Card className="border-[#E4E2DC] bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-[#1C1B18]">
                DeFi Strategy
              </CardTitle>
              <p className="text-sm text-[#6B6960]">
                What happens to incoming payments
              </p>
            </div>
            {(currentStrategy || currentStrategies) && (
              <span className="text-xs text-[#22C55E] font-medium">On-chain</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Strategy Options */}
          {!useMultiStrategy && (
            <>
              <button
                onClick={() => setSelectedStrategy('yield')}
                className={`w-full p-4 rounded-xl border-2 transition-all cursor-pointer text-left ${
                  selectedStrategy === 'yield'
                    ? 'border-[#1C1B18] bg-[#FAFAF8]'
                    : 'border-[#E4E2DC] hover:border-[#C9C7BF]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#EDF5F0] flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#22C55E]">
                      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-[#1C1B18]">Yield Vault</p>
                    <p className="text-sm text-[#6B6960]">Receive USDC → auto-deposit to Aave/Morpho</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-[#22C55E]">4-5%</p>
                    <p className="text-xs text-[#6B6960]">APY</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setSelectedStrategy('restaking')}
                className={`w-full p-4 rounded-xl border-2 transition-all cursor-pointer text-left ${
                  selectedStrategy === 'restaking'
                    ? 'border-[#7C3AED] bg-[#F5F3FF]'
                    : 'border-[#E4E2DC] hover:border-[#C9C7BF]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#F5F3FF] flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#7C3AED]">
                      <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-[#1C1B18]">Restaking</p>
                    <p className="text-sm text-[#6B6960]">Receive WETH → auto-deposit to Renzo</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-[#7C3AED]">Points</p>
                    <p className="text-xs text-[#6B6960]">EigenLayer</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setSelectedStrategy('liquid')}
                className={`w-full p-4 rounded-xl border-2 transition-all cursor-pointer text-left ${
                  selectedStrategy === 'liquid'
                    ? 'border-[#6B7280] bg-[#F9FAFB]'
                    : 'border-[#E4E2DC] hover:border-[#C9C7BF]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#F3F4F6] flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#6B7280]">
                      <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-[#1C1B18]">Liquid</p>
                    <p className="text-sm text-[#6B6960]">Keep USDC in wallet (no DeFi)</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-[#6B7280]">0%</p>
                    <p className="text-xs text-[#6B6960]">APY</p>
                  </div>
                </div>
              </button>

              {/* Save button - only show if strategy changed */}
              {strategyChanged && (
                <Button
                  onClick={handleSaveStrategy}
                  disabled={savingStrategy}
                  className={`w-full ${
                    selectedStrategy === 'restaking'
                      ? 'bg-[#7C3AED] hover:bg-[#6D28D9]'
                      : 'bg-[#1C1B18] hover:bg-[#2D2C28]'
                  } text-white mt-2`}
                >
                  {savingStrategy ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Confirm in wallet...
                    </span>
                  ) : (
                    `Save ${selectedStrategy === 'restaking' ? 'Restaking' : selectedStrategy === 'liquid' ? 'Liquid' : 'Yield'} Strategy to ENS`
                  )}
                </Button>
              )}

              {/* Current strategy indicator */}
              {currentStrategy && !strategyChanged && !useMultiStrategy && (
                <div className="flex items-center justify-center gap-2 text-sm text-[#22C55E]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Strategy saved on-chain</span>
                </div>
              )}
            </>
          )}

          {/* Multi-Strategy Mode */}
          {useMultiStrategy && (
            <div className="space-y-3">
              <p className="text-xs text-[#6B6960]">
                Split incoming payments across multiple DeFi strategies
              </p>

              {strategyAllocations.map((alloc, index) => (
                <div key={alloc.strategy} className="flex items-center gap-3 p-3 rounded-lg bg-[#FAFAF8]">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    alloc.strategy === 'yield' ? 'bg-[#EDF5F0]' :
                    alloc.strategy === 'restaking' ? 'bg-[#F5F3FF]' :
                    'bg-[#F3F4F6]'
                  }`}>
                    {alloc.strategy === 'yield' && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#22C55E]">
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                    {alloc.strategy === 'restaking' && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#7C3AED]">
                        <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                    {alloc.strategy === 'liquid' && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#6B7280]">
                        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm text-[#1C1B18] capitalize">{alloc.strategy}</p>
                    <p className="text-xs text-[#6B6960]">
                      {alloc.strategy === 'yield' ? 'USDC → Aave/Morpho' :
                       alloc.strategy === 'restaking' ? 'WETH → Renzo ezETH' :
                       'Keep USDC liquid'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={alloc.percentage}
                      onChange={(e) => updateStrategyAllocation(index, parseInt(e.target.value))}
                      className={`w-24 ${
                        alloc.strategy === 'yield' ? 'accent-[#22C55E]' :
                        alloc.strategy === 'restaking' ? 'accent-[#7C3AED]' :
                        'accent-[#6B7280]'
                      }`}
                    />
                    <span className="w-12 text-right font-mono text-sm text-[#1C1B18]">
                      {alloc.percentage}%
                    </span>
                    {strategyAllocations.length > 1 && (
                      <button
                        onClick={() => removeStrategyAllocation(index)}
                        className="p-1 text-[#9C9B93] hover:text-red-500"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Add strategy button */}
              {strategyAllocations.length < 3 && (
                <button
                  onClick={addStrategyAllocation}
                  className="w-full p-3 rounded-lg border-2 border-dashed border-[#E4E2DC] text-sm text-[#6B6960] hover:border-[#1C1B18] hover:text-[#1C1B18] transition-colors"
                >
                  + Add Strategy
                </button>
              )}

              {/* Total indicator */}
              <div className={`flex items-center justify-between p-3 rounded-lg ${
                strategyAllocationTotal === 100 ? 'bg-[#EDF5F0]' : 'bg-[#FFF3E0]'
              }`}>
                <span className="text-sm font-medium text-[#1C1B18]">Total Allocation</span>
                <span className={`font-mono font-semibold ${
                  strategyAllocationTotal === 100 ? 'text-[#22C55E]' : 'text-[#E65100]'
                }`}>
                  {strategyAllocationTotal}%
                </span>
              </div>

              {strategyAllocationTotal !== 100 && (
                <p className="text-xs text-[#E65100]">
                  Allocations must sum to 100%
                </p>
              )}

              {/* Save button */}
              {multiStrategyChanged && (
                <Button
                  onClick={handleSaveMultiStrategy}
                  disabled={savingStrategy || strategyAllocationTotal !== 100}
                  className="w-full bg-[#1C1B18] hover:bg-[#2D2C28] text-white"
                >
                  {savingStrategy ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      Confirm in wallet...
                    </span>
                  ) : (
                    'Save Multi-Strategy to ENS'
                  )}
                </Button>
              )}

              {/* Current multi-strategy indicator */}
              {currentStrategies && !multiStrategyChanged && (
                <div className="flex items-center justify-center gap-2 text-sm text-[#22C55E]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Multi-strategy saved on-chain</span>
                </div>
              )}
            </div>
          )}

          {/* Success message */}
          {strategySuccess && strategyTxHash && (
            <div className="rounded-lg bg-[#EDF5F0] border border-[#B7D4C7] p-3 mt-2">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-[#22C55E] flex items-center justify-center flex-shrink-0">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-white">
                    <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#2D6A4F]">
                    Strategy saved to ENS!
                  </p>
                  <p className="text-xs text-[#2D6A4F]/70 mt-1">
                    <span className="font-medium">Record:</span> {useMultiStrategy ? `flowfi.strategies → ${formatStrategiesForENS()}` : `flowfi.strategy → ${selectedStrategy}`}
                  </p>
                  <a
                    href={`https://etherscan.io/tx/${strategyTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#2D6A4F] hover:underline mt-1 inline-block"
                  >
                    View transaction →
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Error message */}
          {strategyError && (
            <p className="text-sm text-red-600 mt-2">{strategyError}</p>
          )}
        </CardContent>
      </Card>

      {/* Yield Vault Selection - only show if yield strategy */}
      {selectedStrategy === 'yield' && (
      <Card className="border-[#E4E2DC] bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-[#1C1B18]">
                Yield Vault
              </CardTitle>
              <p className="text-sm text-[#6B6960]">
                Where your USDC earns yield
              </p>
            </div>
            {currentVault && !vaultChanged && (
              <span className="text-xs text-[#22C55E] font-medium">On-chain</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Aave - Safe option */}
          <button
            onClick={() => setSelectedVaultId('aave-usdc')}
            className={`w-full p-4 rounded-xl border-2 transition-all cursor-pointer text-left ${
              selectedVaultId === 'aave-usdc'
                ? 'border-[#22C55E] bg-[#F0FDF4]'
                : 'border-[#E4E2DC] hover:border-[#C9C7BF]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#EDF5F0] flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#22C55E]">
                    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2"/>
                    <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-[#1C1B18]">Aave</p>
                  <p className="text-sm text-[#6B6960]">Battle-tested · Recommended</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-[#22C55E]">{vaultApys['aave-usdc'] ?? '~4'}%</p>
                <p className="text-xs text-[#6B6960]">APY</p>
              </div>
            </div>
          </button>

          {/* Spark - Higher yield option */}
          <button
            onClick={() => setSelectedVaultId('spark-usdc')}
            className={`w-full p-4 rounded-xl border-2 transition-all cursor-pointer text-left ${
              selectedVaultId === 'spark-usdc'
                ? 'border-[#F59E0B] bg-[#FFFBEB]'
                : 'border-[#E4E2DC] hover:border-[#C9C7BF]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#FEF3C7] flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#F59E0B]">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-[#1C1B18]">Spark</p>
                  <p className="text-sm text-[#6B6960]">Higher yield · MakerDAO ecosystem</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-[#F59E0B]">{vaultApys['spark-usdc'] ?? '~5'}%</p>
                <p className="text-xs text-[#6B6960]">APY</p>
              </div>
            </div>
          </button>

          {/* Custom vault option */}
          <button
            onClick={() => setSelectedVaultId('custom')}
            className={`w-full p-4 rounded-xl border-2 border-dashed transition-all cursor-pointer text-left ${
              selectedVaultId === 'custom'
                ? 'border-[#1C1B18] bg-[#FAFAF8]'
                : 'border-[#E4E2DC] hover:border-[#C9C7BF]'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#F8F7F4] flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#6B6960]">
                  <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <p className="font-medium text-[#1C1B18]">Custom Vault</p>
                <p className="text-sm text-[#6B6960]">Any ERC-4626 vault on Base</p>
              </div>
            </div>
          </button>

          {selectedVaultId === 'custom' && (
            <Input
              placeholder="0x... vault address"
              value={customVault}
              onChange={(e) => setCustomVault(e.target.value)}
              className="font-mono border-[#E4E2DC] mt-2"
            />
          )}

          {/* Save button - only show if changed */}
          {vaultChanged && selectedVaultId !== 'none' && vaultAddress && (
            <Button
              onClick={handleSaveVault}
              disabled={saving}
              className="w-full bg-[#1C1B18] hover:bg-[#2D2C28] text-white mt-4"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Confirm in wallet...
                </span>
              ) : (
                'Save to ENS'
              )}
            </Button>
          )}

          {saveSuccess && (
            <div className="rounded-lg bg-[#EDF5F0] border border-[#B7D4C7] p-4 mt-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#22C55E] flex items-center justify-center flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white">
                    <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#2D6A4F]">
                    Vault saved to ENS!
                  </p>
                  <p className="text-xs text-[#2D6A4F]/70 mt-1">
                    <span className="font-medium">Record:</span> yieldroute.vault → {selectedVault?.name || 'Custom Vault'} (Base)
                  </p>
                  <p className="text-xs text-[#2D6A4F]/70">
                    <span className="font-medium">Stored on:</span> Ethereum mainnet (ENS)
                  </p>
                  {saveTxHash && (
                    <a
                      href={`https://etherscan.io/tx/${saveTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#2D6A4F] hover:underline mt-2"
                    >
                      View on Etherscan
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {saveError && (
            <p className="text-sm text-red-600 mt-2">{saveError}</p>
          )}

        </CardContent>
      </Card>
      )}

      {/* Advanced: SmartVaultHook Multi-Vault Allocation - only show if yield strategy */}
      {selectedStrategy === 'yield' && (
      <Card className="border-[#E4E2DC] bg-white">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-[#1C1B18]">
                Advanced Yield Settings
              </CardTitle>
              <p className="text-sm text-[#6B6960]">
                Split deposits across vaults or enable APY-based routing
              </p>
            </div>
            {smartVaultConfig && smartVaultConfig.allocations.length > 0 && (
              <span className="text-xs text-[#22C55E] font-medium">On-chain</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setUseMultiVault(false)
                setUseConditionalRouting(false)
              }}
              className={`flex-1 p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                !useMultiVault && !useConditionalRouting
                  ? 'border-[#1C1B18] bg-[#FAFAF8]'
                  : 'border-[#E4E2DC] hover:border-[#C9C7BF]'
              }`}
            >
              Single Vault
            </button>
            <button
              onClick={() => {
                setUseMultiVault(true)
                setUseConditionalRouting(false)
              }}
              className={`flex-1 p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                useMultiVault && !useConditionalRouting
                  ? 'border-[#1C1B18] bg-[#FAFAF8]'
                  : 'border-[#E4E2DC] hover:border-[#C9C7BF]'
              }`}
            >
              Split Vaults
            </button>
            <button
              onClick={() => {
                setUseMultiVault(false)
                setUseConditionalRouting(true)
              }}
              className={`flex-1 p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                useConditionalRouting
                  ? 'border-[#1C1B18] bg-[#FAFAF8]'
                  : 'border-[#E4E2DC] hover:border-[#C9C7BF]'
              }`}
            >
              Best APY
            </button>
          </div>

          {/* Multi-Vault Allocation UI */}
          {useMultiVault && !useConditionalRouting && (
            <div className="space-y-3 pt-2">
              <p className="text-xs text-[#6B6960]">
                Split incoming payments across multiple vaults
              </p>

              {multiVaultAllocations.map((alloc, index) => (
                <div key={alloc.vault.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#FAFAF8]">
                  <div className="flex-1">
                    <p className="font-medium text-[#1C1B18] text-sm">{alloc.vault.name}</p>
                    <p className="text-xs text-[#6B6960]">{alloc.vault.protocol}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={alloc.percentage}
                      onChange={(e) => updateAllocation(index, parseInt(e.target.value))}
                      className="w-24 accent-[#1C1B18]"
                    />
                    <span className="w-12 text-right font-mono text-sm text-[#1C1B18]">
                      {alloc.percentage}%
                    </span>
                    {multiVaultAllocations.length > 1 && (
                      <button
                        onClick={() => removeVaultAllocation(index)}
                        className="p-1 text-[#9C9B93] hover:text-red-500"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Add vault button */}
              {multiVaultAllocations.length < VAULT_OPTIONS.filter(v => v.id !== 'none').length && (
                <button
                  onClick={addVaultAllocation}
                  className="w-full p-3 rounded-lg border-2 border-dashed border-[#E4E2DC] text-sm text-[#6B6960] hover:border-[#1C1B18] hover:text-[#1C1B18] transition-colors"
                >
                  + Add Vault
                </button>
              )}

              {/* Total indicator */}
              <div className={`flex items-center justify-between p-3 rounded-lg ${
                totalAllocation === 100 ? 'bg-[#EDF5F0]' : 'bg-[#FFF3E0]'
              }`}>
                <span className="text-sm font-medium text-[#1C1B18]">Total Allocation</span>
                <span className={`font-mono font-semibold ${
                  totalAllocation === 100 ? 'text-[#22C55E]' : 'text-[#E65100]'
                }`}>
                  {totalAllocation}%
                </span>
              </div>

              {totalAllocation !== 100 && (
                <p className="text-xs text-[#E65100]">
                  Allocations must sum to 100%
                </p>
              )}

              <Button
                onClick={handleSaveMultiVault}
                disabled={savingMultiVault || totalAllocation !== 100}
                className="w-full bg-[#1C1B18] hover:bg-[#2D2C28] text-white"
              >
                {savingMultiVault ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Confirm in wallet...
                  </span>
                ) : (
                  'Save to SmartVaultHook (Base)'
                )}
              </Button>
            </div>
          )}

          {/* Conditional Routing (Best APY) UI */}
          {useConditionalRouting && (
            <div className="space-y-3 pt-2">
              <div className="p-4 rounded-lg bg-[#EDF5F0] border border-[#B7D4C7]">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#22C55E] flex items-center justify-center flex-shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white">
                      <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-[#2D6A4F]">Auto-route to Highest APY</p>
                    <p className="text-xs text-[#2D6A4F]/70 mt-1">
                      SmartVaultHook will automatically deposit to the vault with the best yield at payment time
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-xs text-[#6B6960]">
                Vaults considered:
              </div>
              <div className="space-y-2">
                {VAULT_OPTIONS.filter(v => v.id !== 'none').map((vault) => (
                  <div key={vault.id} className="flex items-center justify-between p-3 rounded-lg bg-[#FAFAF8]">
                    <div>
                      <p className="font-medium text-sm text-[#1C1B18]">{vault.name}</p>
                      <p className="text-xs text-[#6B6960]">{vault.protocol}</p>
                    </div>
                    <span className="font-semibold text-[#22C55E]">
                      {vaultApys[vault.id] ?? '—'}%
                    </span>
                  </div>
                ))}
              </div>

              <Button
                onClick={handleToggleConditionalRouting}
                disabled={savingMultiVault}
                className={`w-full ${
                  smartVaultConfig?.conditionalRoutingEnabled
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-[#1C1B18] hover:bg-[#2D2C28]'
                } text-white`}
              >
                {savingMultiVault ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Confirm in wallet...
                  </span>
                ) : smartVaultConfig?.conditionalRoutingEnabled ? (
                  'Disable Conditional Routing'
                ) : (
                  'Enable Conditional Routing (Base)'
                )}
              </Button>
            </div>
          )}

          {/* Success/Error messages */}
          {multiVaultSuccess && multiVaultTxHash && (
            <div className="rounded-lg bg-[#EDF5F0] border border-[#B7D4C7] p-3">
              <p className="text-sm font-medium text-[#2D6A4F]">
                Settings saved to SmartVaultHook!
              </p>
              <a
                href={`https://basescan.org/tx/${multiVaultTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#2D6A4F]/70 hover:underline mt-1 inline-flex items-center gap-1"
              >
                View on BaseScan
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path d="M7 17L17 7M17 7H7M17 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            </div>
          )}

          {multiVaultError && (
            <p className="text-sm text-red-600">{multiVaultError}</p>
          )}

          <p className="text-xs text-center text-[#6B6960]">
            Advanced settings are stored on Base via SmartVaultHook
          </p>
        </CardContent>
      </Card>
      )}

      {/* Receipt NFTs from SmartVaultHook */}
      {smartVaultReceipts.length > 0 && (
        <Card className="border-[#E4E2DC] bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold text-[#1C1B18]">
              Payment Receipts (NFTs)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {smartVaultReceipts.slice(0, 5).map((receipt) => (
                <div
                  key={receipt.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-[#FAFAF8]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#627EEA] to-[#C99FFF] flex items-center justify-center">
                      <span className="text-xs font-bold text-white">#{receipt.nftId}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#1C1B18]">
                        +{receipt.amount} {receipt.tokenSymbol}
                      </p>
                      <p className="text-xs text-[#6B6960]">
                        From {receipt.sender.slice(0, 6)}...{receipt.sender.slice(-4)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[#6B6960]">
                      {new Date(receipt.timestamp).toLocaleDateString()}
                    </p>
                    {receipt.deposits.length > 1 && (
                      <p className="text-xs text-[#22C55E]">
                        Split to {receipt.deposits.length} vaults
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

        </div>
      )}

      {/* Recent Payments */}
      <Card className="border-[#E4E2DC] bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-[#1C1B18]">
            Recent Payments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {receiptsLoading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-[#F8F7F4] rounded-lg" />
              ))}
            </div>
          ) : receipts.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#F8F7F4] flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#9C9B93]">
                  <path d="M12 2V6M12 18V22M6 12H2M22 12H18M19.07 4.93L16.24 7.76M7.76 16.24L4.93 19.07M19.07 19.07L16.24 16.24M7.76 7.76L4.93 4.93" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="text-[#6B6960]">No payments yet</p>
              <p className="text-sm text-[#9C9B93] mt-1">Share your link to start receiving</p>
            </div>
          ) : (
            <div className="space-y-2">
              {receipts.slice(0, 5).map((receipt) => (
                <div
                  key={receipt.txHash}
                  className="flex items-center justify-between p-3 rounded-lg bg-[#FAFAF8]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#EDF5F0] flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#22C55E]">
                        <path d="M12 5V19M5 12L12 5L19 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#1C1B18]">
                        From {formatAddress(receipt.from)}
                      </p>
                      <p className="text-xs text-[#6B6960]">
                        {formatDate(receipt.createdAt)} · {receipt.chain}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-[#1C1B18]">
                      +{receipt.amount} {receipt.token}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

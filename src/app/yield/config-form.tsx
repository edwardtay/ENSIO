'use client'

import { useState, useEffect } from 'react'
import { useAccount, useSendTransaction, useSwitchChain } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Known ERC-4626 vaults on Base
const VAULTS = [
  {
    address: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB',
    name: 'Aave USDC',
    apy: '~4.2%',
    protocol: 'Aave v3',
  },
  {
    address: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
    name: 'Morpho USDC',
    apy: '~5.1%',
    protocol: 'Morpho',
  },
] as const

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

export function ConfigForm() {
  const { address, isConnected, chainId } = useAccount()
  const { sendTransactionAsync } = useSendTransaction()
  const { switchChainAsync } = useSwitchChain()
  const { name: ensName, loading: ensLoading } = useEnsName(address)
  const [selectedVault, setSelectedVault] = useState<string>('')
  const [customVault, setCustomVault] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  // Determine the actual vault address to use
  const vaultAddress = selectedVault === 'custom' ? customVault : selectedVault

  const handleSave = async () => {
    if (!vaultAddress || !ensName) return

    setSaving(true)
    setSaved(false)
    setSaveError(null)
    setTxHash(null)

    try {
      // Switch to mainnet if needed (ENS is on mainnet)
      if (chainId !== 1) {
        await switchChainAsync({ chainId: 1 })
      }

      // Get transaction data from API
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

      // Send transaction
      const hash = await sendTransactionAsync({
        to: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        value: BigInt(txData.value || 0),
      })

      setTxHash(hash)
      setSaved(true)
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Transaction failed'
      if (/rejected|denied|user refused/i.test(errMsg)) {
        setSaveError('Transaction was rejected')
      } else {
        setSaveError(errMsg)
      }
    } finally {
      setSaving(false)
    }
  }

  if (!isConnected) {
    return (
      <Card className="border-[#E4E2DC] bg-white">
        <CardContent className="p-8 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#F8F7F4] flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#6B6960]">
              <path d="M19 21V19C19 17.9391 18.5786 16.9217 17.8284 16.1716C17.0783 15.4214 16.0609 15 15 15H9C7.93913 15 6.92172 15.4214 6.17157 16.1716C5.42143 16.9217 5 17.9391 5 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-[#1C1B18] font-medium mb-4">
            Connect your wallet to configure YieldRoute
          </p>
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <Button
                onClick={openConnectModal}
                className="bg-[#1C1B18] hover:bg-[#2D2C28] text-white"
              >
                Connect Wallet
              </Button>
            )}
          </ConnectButton.Custom>
        </CardContent>
      </Card>
    )
  }

  if (ensLoading) {
    return (
      <Card className="border-[#E4E2DC] bg-white">
        <CardContent className="p-8 text-center">
          <div className="animate-spin w-6 h-6 border-2 border-[#1C1B18] border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-sm text-[#6B6960]">Loading ENS data...</p>
        </CardContent>
      </Card>
    )
  }

  if (!ensName) {
    return (
      <Card className="border-[#E4E2DC] bg-white">
        <CardContent className="p-8 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#FFF3E0] flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[#E65100]">
              <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-[#1C1B18] font-medium mb-2">
            ENS name required
          </p>
          <p className="text-sm text-[#6B6960] mb-4">
            You need an ENS name to use YieldRoute. Your vault preference is stored as an ENS text record.
          </p>
          <a
            href="https://app.ens.domains"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#1C1B18] hover:underline"
          >
            Get an ENS name
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 13V19C18 19.5304 17.7893 20.0391 17.4142 20.4142C17.0391 20.7893 16.5304 21 16 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V8C3 7.46957 3.21071 6.96086 3.58579 6.58579C3.96086 6.21071 4.46957 6 5 6H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15 3H21V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </CardContent>
      </Card>
    )
  }

  const paymentLink = typeof window !== 'undefined'
    ? `${window.location.origin}/pay/${ensName}`
    : `/pay/${ensName}`

  return (
    <div className="space-y-6">
      {/* Payment Link Card */}
      <Card className="border-[#E4E2DC] bg-white">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold text-[#1C1B18]">
            Welcome, {ensName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-[#1C1B18] mb-1.5 block">
              Your Payment Link
            </label>
            <div className="flex gap-2">
              <Input
                value={paymentLink}
                readOnly
                className="font-mono text-sm border-[#E4E2DC] bg-[#F8F7F4]"
              />
              <Button
                variant="outline"
                className="shrink-0 border-[#E4E2DC] hover:bg-[#F8F7F4]"
                onClick={() => navigator.clipboard.writeText(paymentLink)}
              >
                Copy
              </Button>
            </div>
            <p className="text-xs text-[#6B6960] mt-2">
              Share this link to receive payments with auto-yield deposit
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Vault Settings Card */}
      <Card className="border-[#E4E2DC] bg-white">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold text-[#1C1B18]">
            Yield Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-[#1C1B18] mb-1.5 block">
              Deposit into vault
            </label>
            <select
              value={selectedVault}
              onChange={(e) => setSelectedVault(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-[#E4E2DC] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1C1B18] focus:border-transparent"
            >
              <option value="">Select a vault...</option>
              {VAULTS.map((v) => (
                <option key={v.address} value={v.address}>
                  {v.name} ({v.apy} APY) — {v.protocol}
                </option>
              ))}
              <option value="custom">Custom vault address</option>
            </select>
          </div>

          {selectedVault === 'custom' && (
            <div>
              <label className="text-sm font-medium text-[#1C1B18] mb-1.5 block">
                Vault Address
              </label>
              <Input
                placeholder="0x..."
                value={customVault}
                onChange={(e) => setCustomVault(e.target.value)}
                className="font-mono border-[#E4E2DC]"
              />
              <p className="text-xs text-[#6B6960] mt-1.5">
                Enter an ERC-4626 vault address on Base
              </p>
            </div>
          )}

          {/* Selected vault info */}
          {selectedVault && selectedVault !== 'custom' && (
            <div className="rounded-lg bg-[#F8F7F4] p-3">
              <p className="text-xs text-[#6B6960] font-mono break-all">
                {selectedVault}
              </p>
            </div>
          )}

          {/* Success message */}
          {saved && txHash && (
            <div className="rounded-lg bg-[#EDF5F0] border border-[#B7D4C7] p-3">
              <p className="text-sm font-medium text-[#2D6A4F] mb-1">
                Vault preference saved!
              </p>
              <a
                href={`https://etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#2D6A4F]/70 font-mono break-all hover:underline"
              >
                View transaction
              </a>
            </div>
          )}

          {/* Error message */}
          {saveError && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {saveError}
            </div>
          )}

          <Button
            className="w-full bg-[#1C1B18] hover:bg-[#2D2C28] text-white"
            disabled={!vaultAddress || saving}
            onClick={handleSave}
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Confirm in wallet...
              </span>
            ) : saved ? (
              <span className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Saved to ENS
              </span>
            ) : (
              'Save to ENS'
            )}
          </Button>

          <p className="text-xs text-center text-[#6B6960]">
            This will set the <code className="font-mono bg-[#F8F7F4] px-1 py-0.5 rounded">yieldroute.vault</code> text record on your ENS name (requires mainnet gas)
          </p>
        </CardContent>
      </Card>

      {/* How it works */}
      <Card className="border-[#E4E2DC] bg-white">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold text-[#1C1B18]">
            How it works
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm text-[#6B6960]">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#F8F7F4] text-[#1C1B18] font-medium text-xs flex items-center justify-center">
                1
              </span>
              <span>Select your preferred yield vault above</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#F8F7F4] text-[#1C1B18] font-medium text-xs flex items-center justify-center">
                2
              </span>
              <span>Share your payment link with payers</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#F8F7F4] text-[#1C1B18] font-medium text-xs flex items-center justify-center">
                3
              </span>
              <span>Payments are bridged to Base and deposited into your vault automatically</span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}

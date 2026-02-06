'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useGasTank } from '@/hooks/use-gas-tank'
import type { Address } from 'viem'

// Vault options on Base
const VAULT_OPTIONS = [
  {
    name: 'Aave USDC',
    address: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB' as Address,
    apy: '~4.5%',
    risk: 'Low',
  },
  {
    name: 'Moonwell USDC',
    address: '0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca' as Address,
    apy: '~5.2%',
    risk: 'Low',
  },
  {
    name: 'Spark USDC',
    address: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A' as Address,
    apy: '~6.1%',
    risk: 'Medium',
  },
  {
    name: 'No Vault (Direct)',
    address: '0x0000000000000000000000000000000000000000' as Address,
    apy: '0%',
    risk: 'None',
  },
]

interface Props {
  ensName?: string
  onComplete?: () => void
}

export function ReceiverSetup({ ensName, onComplete }: Props) {
  const { address, isConnected } = useAccount()
  const gasTank = useGasTank()

  const [step, setStep] = useState<'vault' | 'deposit' | 'done'>('vault')
  const [selectedVault, setSelectedVault] = useState<Address | null>(null)
  const [depositAmount, setDepositAmount] = useState('0.005')

  const handleVaultSelect = async (vault: Address) => {
    setSelectedVault(vault)
    if (vault !== '0x0000000000000000000000000000000000000000') {
      await gasTank.setDefaultVault(vault)
    }
    setStep('deposit')
  }

  const handleDeposit = async () => {
    await gasTank.deposit(depositAmount)
    setStep('done')
    onComplete?.()
  }

  if (!isConnected) {
    return (
      <Card className="border-[#E4E2DC] bg-white max-w-lg mx-auto">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-[#1C1B18]">
            Set Up Your Payment Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[#6B6960]">
            Connect your wallet to set up gasless payments. Payers will pay $0 gas.
          </p>
          <ConnectButton />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-[#E4E2DC] bg-white max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="text-xl font-semibold text-[#1C1B18]">
          {step === 'vault' && 'Choose Your Yield Vault'}
          {step === 'deposit' && 'Fund Your Gas Tank'}
          {step === 'done' && 'Setup Complete!'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === 'vault'
                ? 'bg-[#1C1B18] text-white'
                : 'bg-[#E4E2DC] text-[#6B6960]'
            }`}
          >
            1
          </div>
          <div className="flex-1 h-0.5 bg-[#E4E2DC]" />
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === 'deposit'
                ? 'bg-[#1C1B18] text-white'
                : step === 'done'
                ? 'bg-[#E4E2DC] text-[#6B6960]'
                : 'bg-[#E4E2DC] text-[#6B6960]'
            }`}
          >
            2
          </div>
          <div className="flex-1 h-0.5 bg-[#E4E2DC]" />
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === 'done'
                ? 'bg-[#22C55E] text-white'
                : 'bg-[#E4E2DC] text-[#6B6960]'
            }`}
          >
            {step === 'done' ? '✓' : '3'}
          </div>
        </div>

        {/* Step 1: Vault Selection */}
        {step === 'vault' && (
          <div className="space-y-3">
            <p className="text-sm text-[#6B6960]">
              Where should incoming payments be deposited? Choose a yield vault to
              earn while you receive.
            </p>
            {VAULT_OPTIONS.map((vault) => (
              <button
                key={vault.address}
                onClick={() => handleVaultSelect(vault.address)}
                disabled={gasTank.txPending}
                className={`w-full p-4 rounded-lg border text-left transition-all hover:border-[#1C1B18] ${
                  selectedVault === vault.address
                    ? 'border-[#1C1B18] bg-[#F8F7F4]'
                    : 'border-[#E4E2DC]'
                } disabled:opacity-50`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-[#1C1B18]">{vault.name}</p>
                    <p className="text-xs text-[#6B6960]">Risk: {vault.risk}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-[#22C55E]">{vault.apy}</p>
                    <p className="text-xs text-[#6B6960]">APY</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Gas Tank Deposit */}
        {step === 'deposit' && (
          <div className="space-y-4">
            <p className="text-sm text-[#6B6960]">
              Deposit ETH to your gas tank. This pays for incoming payment
              execution. Payers pay $0 - you cover the ~$0.02/payment.
            </p>

            <div className="rounded-lg bg-[#F8F7F4] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[#6B6960]">Current Balance</span>
                <span className="font-mono text-[#1C1B18]">
                  {gasTank.status?.balance || '0'} ETH
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#6B6960]">Est. Payments</span>
                <span className="font-mono text-[#1C1B18]">
                  ~{gasTank.status?.estimatedPayments || 0} payments
                </span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-[#1C1B18] mb-1.5 block">
                Deposit Amount
              </label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.001"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="flex-1 border-[#E4E2DC]"
                />
                <span className="flex items-center px-3 text-sm text-[#6B6960]">
                  ETH
                </span>
              </div>
              <p className="text-xs text-[#6B6960] mt-1">
                0.005 ETH ≈ ~100 payments on Base
              </p>
            </div>

            <div className="flex gap-2">
              {['0.002', '0.005', '0.01'].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setDepositAmount(amount)}
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-all ${
                    depositAmount === amount
                      ? 'border-[#1C1B18] bg-[#F8F7F4]'
                      : 'border-[#E4E2DC] hover:border-[#9C9B93]'
                  }`}
                >
                  {amount} ETH
                </button>
              ))}
            </div>

            <Button
              onClick={handleDeposit}
              disabled={gasTank.txPending || !depositAmount}
              className="w-full h-12 bg-[#1C1B18] hover:bg-[#2D2C28] text-white"
            >
              {gasTank.txPending ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Confirming...
                </span>
              ) : (
                `Deposit ${depositAmount} ETH`
              )}
            </Button>

            <button
              onClick={() => setStep('vault')}
              className="w-full text-sm text-[#6B6960] hover:text-[#1C1B18]"
            >
              ← Back to vault selection
            </button>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 'done' && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#22C55E] flex items-center justify-center">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                className="text-white"
              >
                <path
                  d="M20 6L9 17L4 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-[#1C1B18]">
                You're ready to receive!
              </h3>
              <p className="text-sm text-[#6B6960] mt-1">
                Share your payment link and start receiving gasless payments.
              </p>
            </div>

            <div className="rounded-lg bg-[#F8F7F4] p-4">
              <p className="text-xs text-[#6B6960] mb-1">Your payment link</p>
              <p className="font-mono text-[#1C1B18] break-all">
                flowfi.xyz/pay/{ensName || address?.slice(0, 10)}
              </p>
            </div>

            <div className="rounded-lg bg-[#F0FFF4] border border-[#9AE6B4] p-4 text-left">
              <p className="text-sm font-medium text-[#166534]">AI Agent Active</p>
              <p className="text-xs text-[#22C55E] mt-1">
                Your account is now monitored. The agent will auto-refill your gas
                tank when low and optimize your yield.
              </p>
            </div>

            {gasTank.status && (
              <div className="text-sm text-[#6B6960]">
                Tank balance: {gasTank.status.balance} ETH (~
                {gasTank.status.estimatedPayments} payments)
              </div>
            )}
          </div>
        )}

        {/* Error display */}
        {gasTank.error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {gasTank.error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

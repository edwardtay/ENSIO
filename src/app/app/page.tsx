'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { ReceiverDashboard } from '@/components/receiver-dashboard'

function useL2PrimaryName(address?: string, chainId?: number) {
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    if (!address || !chainId || chainId === 1) {
      setName(null)
      return
    }
    let cancelled = false
    fetch(`/api/ens/primary-name?address=${address}&chainId=${chainId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setName(data.name ?? null)
      })
      .catch(() => {
        if (!cancelled) setName(null)
      })
    return () => { cancelled = true }
  }, [address, chainId])

  return name
}

export default function AppPage() {
  const { address, chainId } = useAccount()
  const l2Name = useL2PrimaryName(address, chainId)

  return (
    <div className="flex flex-col min-h-screen bg-[#F8F7F4]">
      {/* Header */}
      <header className="flex items-center justify-between px-5 sm:px-8 py-3 border-b border-[#E4E2DC] bg-white shrink-0">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity">
          <div className="w-7 h-7 rounded-md bg-[#1C1B18] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-[#F8F7F4]">
              <path d="M8 1L14.5 5V11L8 15L1.5 11V5L8 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M8 5.5V10.5M5.5 8H10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-[#1C1B18]">
            AcceptAny
          </span>
        </Link>

        <ConnectButton.Custom>
          {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
            const ready = mounted
            const connected = ready && account && chain

            if (!connected) {
              return (
                <button
                  onClick={openConnectModal}
                  type="button"
                  className="px-4 py-2 text-[13px] font-medium rounded-lg bg-[#1C1B18] text-[#F8F7F4] hover:bg-[#2D2C28] transition-colors cursor-pointer"
                >
                  Connect Wallet
                </button>
              )
            }

            if (chain.unsupported) {
              return (
                <button
                  onClick={openChainModal}
                  type="button"
                  className="px-4 py-2 text-[13px] font-medium rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors cursor-pointer"
                >
                  Wrong network
                </button>
              )
            }

            const displayName = l2Name || account.ensName || account.displayName
            const avatarUrl = account.ensAvatar

            return (
              <div className="flex items-center gap-2">
                {/* Chain indicator */}
                <button
                  onClick={openChainModal}
                  type="button"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E4E2DC] hover:border-[#C9C7BF] transition-colors cursor-pointer bg-white"
                >
                  {chain.hasIcon && chain.iconUrl && (
                    <Image
                      alt={chain.name ?? 'Chain'}
                      src={chain.iconUrl}
                      width={16}
                      height={16}
                      className="rounded-full"
                    />
                  )}
                  <span className="text-[12px] font-medium text-[#6B6A63] hidden sm:inline">
                    {chain.name}
                  </span>
                </button>

                {/* Account button */}
                <button
                  onClick={openAccountModal}
                  type="button"
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#E4E2DC] hover:border-[#C9C7BF] transition-colors cursor-pointer bg-white"
                >
                  {avatarUrl ? (
                    <Image
                      alt="ENS Avatar"
                      src={avatarUrl}
                      width={22}
                      height={22}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="w-[22px] h-[22px] rounded-full bg-[#E4E2DC] flex items-center justify-center">
                      <span className="text-[10px] font-bold text-[#6B6A63]">
                        {(account.address || '').slice(2, 4).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <span className="text-[13px] font-medium text-[#1C1B18]">
                    {displayName}
                  </span>
                </button>
              </div>
            )
          }}
        </ConnectButton.Custom>
      </header>

      <ReceiverDashboard />
    </div>
  )
}

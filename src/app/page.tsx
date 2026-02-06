'use client'

import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { ReceiverDashboard } from '@/components/receiver-dashboard'

export default function HomePage() {
  const { isConnected } = useAccount()

  // Connected: show dashboard
  if (isConnected) {
    return (
      <div className="flex flex-col min-h-screen bg-[#F8F7F4]">
        {/* Header */}
        <header className="flex items-center justify-between px-5 sm:px-8 py-3 border-b border-[#E4E2DC] bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="FlowFi" className="w-7 h-7 rounded-lg" />
            <span className="text-[15px] font-semibold tracking-tight text-[#1C1B18]">
              FlowFi
            </span>
          </div>
          <ConnectButton />
        </header>

        <ReceiverDashboard />
      </div>
    )
  }

  // Not connected: show landing page
  return (
    <div className="min-h-screen bg-[#F8F7F4] flex flex-col">
      {/* Nav */}
      <nav className="border-b border-[#E4E2DC] bg-[#F8F7F4]/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="FlowFi" className="w-7 h-7 rounded-lg" />
            <span className="text-sm font-semibold text-[#1C1B18]">FlowFi</span>
          </div>
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button
                onClick={openConnectModal}
                className="px-4 py-1.5 bg-[#1C1B18] text-[#F8F7F4] text-sm font-medium rounded-lg hover:bg-[#2D2C28] transition-colors cursor-pointer"
              >
                Connect Wallet
              </button>
            )}
          </ConnectButton.Custom>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl text-center py-12">
          {/* Main headline */}
          <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl text-[#1C1B18] mb-4 leading-tight">
            Crypto subscriptions.<br /><span className="text-[#22C55E]">Set and forget.</span>
          </h1>
          <p className="text-lg text-[#6B6A63] mb-8 max-w-lg mx-auto">
            Payer signs once. AI agent charges them weekly or monthly. No wallet popups ever again.
          </p>

          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button
                onClick={openConnectModal}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#1C1B18] text-[#F8F7F4] font-medium rounded-xl hover:bg-[#2D2C28] transition-all cursor-pointer"
              >
                Create Your Payment Link
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-60">
                  <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </ConnectButton.Custom>

          {/* How it works - 3 steps */}
          <div className="flex items-start justify-center gap-6 mt-12 text-sm max-w-xl mx-auto">
            <div className="flex-1 text-center">
              <div className="w-10 h-10 rounded-full bg-[#1C1B18] text-white flex items-center justify-center mx-auto mb-2 text-sm font-semibold">1</div>
              <p className="font-semibold text-[#1C1B18]">Payer subscribes</p>
              <p className="text-[#9C9B93] text-xs mt-1">Signs once with Permit2</p>
            </div>
            <div className="flex-1 text-center">
              <div className="w-10 h-10 rounded-full bg-[#1C1B18] text-white flex items-center justify-center mx-auto mb-2 text-sm font-semibold">2</div>
              <p className="font-semibold text-[#1C1B18]">AI agent monitors</p>
              <p className="text-[#9C9B93] text-xs mt-1">Runs 24/7 on schedule</p>
            </div>
            <div className="flex-1 text-center">
              <div className="w-10 h-10 rounded-full bg-[#22C55E] text-white flex items-center justify-center mx-auto mb-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2V6M12 18V22M6 12H2M22 12H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="font-semibold text-[#1C1B18]">Auto-charges</p>
              <p className="text-[#9C9B93] text-xs mt-1">Weekly or monthly</p>
            </div>
          </div>

          {/* Use cases */}
          <div className="mt-10 pt-8 border-t border-[#E4E2DC]">
            <p className="text-xs text-[#9C9B93] mb-4">PERFECT FOR</p>
            <div className="flex items-center justify-center gap-4 text-sm">
              <span className="px-3 py-1.5 rounded-full bg-[#F8F7F4] text-[#1C1B18]">SaaS billing</span>
              <span className="px-3 py-1.5 rounded-full bg-[#F8F7F4] text-[#1C1B18]">Creator memberships</span>
              <span className="px-3 py-1.5 rounded-full bg-[#F8F7F4] text-[#1C1B18]">DAO contributions</span>
              <span className="px-3 py-1.5 rounded-full bg-[#EDF5F0] text-[#22C55E] font-medium">+ Yield</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E4E2DC] py-4">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-between text-xs text-[#9C9B93]">
          <span>Unaudited. Use at own risk.</span>
          <a
            href="https://github.com/edwardtay/hack-money"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#1C1B18]"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  )
}

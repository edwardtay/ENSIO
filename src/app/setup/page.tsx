'use client'

import Link from 'next/link'
import { ReceiverSetup } from '@/components/receiver-setup'

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-[#F8F7F4]">
      {/* Header */}
      <header className="border-b border-[#E4E2DC] bg-white">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="ENSIO" className="w-7 h-7 rounded-lg" />
            <span className="text-lg font-semibold text-[#1C1B18]">ENSIO</span>
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-[#1C1B18] mb-2">
            Set Up Your Payment Link
          </h1>
          <p className="text-[#6B6960]">
            Configure how you receive payments. One-time setup.
          </p>
        </div>

        <ReceiverSetup />

        {/* Features */}
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-[#E4E2DC] p-6">
            <div className="w-10 h-10 rounded-lg bg-[#EDE9FE] flex items-center justify-center mb-4">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                className="text-[#8B5CF6]"
              >
                <path
                  d="M12 2L2 7L12 12L22 7L12 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 17L12 22L22 17"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-[#1C1B18] mb-1">
              Any Token, Any Chain
            </h3>
            <p className="text-sm text-[#6B6960]">
              Clients pay in ETH, USDT, ARB — from 9+ chains. You receive USDC.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-[#E4E2DC] p-6">
            <div className="w-10 h-10 rounded-lg bg-[#F0FFF4] flex items-center justify-center mb-4">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                className="text-[#22C55E]"
              >
                <path
                  d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-[#1C1B18] mb-1">
              Earn While You Wait
            </h3>
            <p className="text-sm text-[#6B6960]">
              Payments auto-deposit to Aave. Earn 5% APY on your balance.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-[#E4E2DC] p-6">
            <div className="w-10 h-10 rounded-lg bg-[#FEF3C7] flex items-center justify-center mb-4">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                className="text-[#F59E0B]"
              >
                <path
                  d="M20 21V19C20 16.79 18.21 15 16 15H8C5.79 15 4 16.79 4 19V21"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle
                  cx="12"
                  cy="7"
                  r="4"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-[#1C1B18] mb-1">
              ENS is Your Link
            </h3>
            <p className="text-sm text-[#6B6960]">
              alice.eth becomes flowfi.xyz/pay/alice.eth — easy to share.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

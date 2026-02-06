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
            <div className="w-8 h-8 rounded-lg bg-[#1C1B18] flex items-center justify-center">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="text-[#F8F7F4]"
              >
                <path
                  d="M8 1L14.5 5V11L8 15L1.5 11V5L8 1Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 5.5V10.5M5.5 8H10.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span className="text-lg font-semibold text-[#1C1B18]">FlowFi</span>
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-[#1C1B18] mb-2">
            Enable Crypto Subscriptions
          </h1>
          <p className="text-[#6B6960]">
            Payers sign once. AI agent charges them automatically.
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
                  d="M12 2V6M12 18V22M6 12H2M22 12H18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-[#1C1B18] mb-1">
              Recurring Payments
            </h3>
            <p className="text-sm text-[#6B6960]">
              Payer signs once. Auto-charged weekly or monthly.
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
                  d="M13 2L3 14H12L11 22L21 10H12L13 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-[#1C1B18] mb-1">
              AI Agent 24/7
            </h3>
            <p className="text-sm text-[#6B6960]">
              Monitors subscriptions, executes on schedule, refills tank.
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
              Payments auto-deposit to yield vaults. 4-8% APY.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

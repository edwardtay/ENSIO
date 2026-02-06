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
            Set Up Your Payment Account
          </h1>
          <p className="text-[#6B6960]">
            One-time setup. Then receive gasless payments forever.
          </p>
        </div>

        <ReceiverSetup />

        {/* Features */}
        <div className="mt-12 grid md:grid-cols-3 gap-6">
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
              Payers Pay $0 Gas
            </h3>
            <p className="text-sm text-[#6B6960]">
              Your gas tank covers execution. Payers just sign.
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
              Auto Yield
            </h3>
            <p className="text-sm text-[#6B6960]">
              Payments auto-deposit to your chosen yield vault.
            </p>
          </div>

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
                  d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M13 2.05C17.94 2.56 22 6.81 22 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M15 9L22 2M22 2H16M22 2V8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-[#1C1B18] mb-1">
              AI Agent
            </h3>
            <p className="text-sm text-[#6B6960]">
              Auto-refills your tank from the cheapest chain.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

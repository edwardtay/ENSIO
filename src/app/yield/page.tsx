import { Suspense } from 'react'
import Link from 'next/link'
import { ConfigForm } from './config-form'

export default function YieldConfigPage() {
  return (
    <div className="min-h-screen bg-[#F8F7F4]">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-[#E4E2DC] bg-[#F8F7F4]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
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
          <Link
            href="/app"
            className="text-sm text-[#6B6960] hover:text-[#1C1B18] transition-colors"
          >
            Back to App
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-[#1C1B18] mb-2">
            AcceptAny
          </h1>
          <p className="text-[#6B6960]">
            Configure your ENS to auto-deposit incoming payments into yield vaults
          </p>
        </div>

        <Suspense
          fallback={
            <div className="animate-pulse">
              <div className="h-64 bg-[#E4E2DC] rounded-xl" />
            </div>
          }
        >
          <ConfigForm />
        </Suspense>
      </main>
    </div>
  )
}

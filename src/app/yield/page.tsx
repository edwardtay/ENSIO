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
            <img src="/logo.png" alt="ENSIO" className="w-7 h-7 rounded-lg" />
            <span className="text-[15px] font-semibold tracking-tight text-[#1C1B18]">
              ENSIO
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
            ENSIO
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

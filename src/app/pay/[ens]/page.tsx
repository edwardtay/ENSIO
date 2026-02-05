import { Suspense } from 'react'
import { PaymentFlow } from './payment-flow'
import Link from 'next/link'

interface Props {
  params: Promise<{ ens: string }>
}

export default async function PayPage({ params }: Props) {
  const { ens } = await params

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
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-6 py-12">
        <Suspense
          fallback={
            <div className="animate-pulse">
              <div className="h-8 w-48 bg-[#E4E2DC] rounded mb-4" />
              <div className="h-64 bg-[#E4E2DC] rounded-xl" />
            </div>
          }
        >
          <PaymentFlow ensName={ens} />
        </Suspense>
      </main>
    </div>
  )
}

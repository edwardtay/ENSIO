import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F8F7F4] flex flex-col">
      {/* Nav */}
      <nav className="border-b border-[#E4E2DC] bg-[#F8F7F4]/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#1C1B18] flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-[#F8F7F4]">
                <path d="M8 1L14.5 5V11L8 15L1.5 11V5L8 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-sm font-semibold text-[#1C1B18]">AcceptAny</span>
          </div>
          <Link
            href="/app"
            className="px-4 py-1.5 bg-[#1C1B18] text-[#F8F7F4] text-sm font-medium rounded-lg hover:bg-[#2D2C28] transition-colors"
          >
            Launch App
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-xl text-center py-20">
          <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl text-[#1C1B18] mb-4 leading-tight">
            Accept any token.<br />Earn yield.
          </h1>
          <p className="text-[#6B6A63] mb-8 text-lg">
            Get paid in any token from any chain. Auto-convert to USDC. Deposit to vaults earning up to 5% APY.
          </p>
          <Link
            href="/app"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#1C1B18] text-[#F8F7F4] font-medium rounded-xl hover:bg-[#2D2C28] transition-all"
          >
            Get Started
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="opacity-60">
              <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>

          {/* Stats */}
          <div className="flex items-center justify-center gap-8 mt-12 text-sm">
            <div>
              <p className="text-2xl font-semibold text-[#22C55E]">5%</p>
              <p className="text-[#9C9B93]">APY</p>
            </div>
            <div className="w-px h-8 bg-[#E4E2DC]" />
            <div>
              <p className="text-2xl font-semibold text-[#1C1B18]">Any</p>
              <p className="text-[#9C9B93]">Token</p>
            </div>
            <div className="w-px h-8 bg-[#E4E2DC]" />
            <div>
              <p className="text-2xl font-semibold text-[#1C1B18]">Any</p>
              <p className="text-[#9C9B93]">Chain</p>
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

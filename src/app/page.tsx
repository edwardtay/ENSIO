import Link from 'next/link'

const FEATURES = [
  {
    number: '01',
    title: '30x Cheaper Swaps',
    description:
      'Our Uniswap v4 hook charges 0.01% per swap instead of the standard 0.30%. An on-chain AI oracle adjusts fees in real-time based on peg stability from Stork price feeds.',
    detail: '0.01% fee',
  },
  {
    number: '02',
    title: 'ENS as Config',
    description:
      'Set com.payagent.token to USDC and com.payagent.chain to Base. That\'s it. Every payment you receive auto-routes to your preferred store of value. Change once, applies everywhere.',
    detail: 'One config',
  },
  {
    number: '03',
    title: 'Cross-Chain Intelligence',
    description:
      'Tokens scattered across Base, Ethereum, Arbitrum, Optimism? PayAgent detects them all and routes through LI.FI for optimal bridging — or converts to gold (PAXG) if that\'s your preference.',
    detail: 'Any chain',
  },
]

const STEPS = [
  { step: '1', text: 'Set your preferred token and chain in ENS text records' },
  { step: '2', text: 'Receive any token on any supported chain' },
  { step: '3', text: 'PayAgent detects the deposit and swaps through the v4 hook' },
  { step: '4', text: 'USDC, gold, or any target — consolidated automatically' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F8F7F4]">
      {/* ─── Nav ─── */}
      <nav className="sticky top-0 z-50 border-b border-[#E4E2DC] bg-[#F8F7F4]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-[#1C1B18] flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-[#F8F7F4]">
                <path d="M8 1L14.5 5V11L8 15L1.5 11V5L8 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M8 5.5V10.5M5.5 8H10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-[#1C1B18]">
              PayAgent
            </span>
          </div>
          <Link
            href="/app"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#1C1B18] text-[#F8F7F4] text-sm font-medium rounded-lg hover:bg-[#2D2C28] transition-colors"
          >
            Launch App
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-[#F8F7F4]/60">
              <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden">
        {/* Subtle radial glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[radial-gradient(ellipse_at_center,_#E8DFC4_0%,_transparent_70%)] opacity-30 pointer-events-none" />

        <div className="relative max-w-4xl mx-auto px-6 pt-24 pb-20 sm:pt-32 sm:pb-28 text-center">
          {/* Live badge */}
          <div className="animate-fade-up inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EDF5F0] border border-[#B7D4C7] mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F] animate-pulse" />
            <span className="text-xs font-medium text-[#2D6A4F]">Live on Base Mainnet</span>
          </div>

          {/* Headline */}
          <h1 className="animate-fade-up animate-fade-up-delay-1 font-[family-name:var(--font-display)] text-5xl sm:text-7xl leading-[1.05] tracking-tight text-[#1C1B18] mb-6">
            Your wealth.
            <br />
            Your terms.
          </h1>

          {/* Subheadline */}
          <p className="animate-fade-up animate-fade-up-delay-2 max-w-2xl mx-auto text-lg sm:text-xl leading-relaxed text-[#6B6A63] mb-10">
            Set your preferred store of value in ENS — USDC, gold, anything.
            PayAgent auto-consolidates everything you receive through a
            Uniswap v4 hook at <span className="text-[#A17D2F] font-semibold">0.01% fees</span>.
          </p>

          {/* CTA */}
          <div className="animate-fade-up animate-fade-up-delay-3 flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
            <Link
              href="/app"
              className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-[#1C1B18] text-[#F8F7F4] text-base font-medium rounded-xl hover:bg-[#2D2C28] transition-all hover:shadow-lg hover:shadow-[#1C1B18]/10"
            >
              Launch App
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-[#F8F7F4]/60">
                <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <a
              href="https://basescan.org/address/0xA5Cb63B540D4334F01346F3D4C51d5B2fFf050c0"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-[#6B6A63] hover:text-[#1C1B18] transition-colors"
            >
              View on BaseScan
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="opacity-40">
                <path d="M4 12L12 4M12 4H6M12 4V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </div>

        </div>
      </section>

      {/* ─── Fee Highlight ─── */}
      <section className="border-y border-[#E4E2DC] bg-white">
        <div className="max-w-6xl mx-auto px-6 py-16 sm:py-20">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-12 text-center">
            <div>
              <p className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl text-[#A17D2F] mb-2">0.01%</p>
              <p className="text-sm text-[#6B6A63]">Swap fee via PayAgent Hook</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl text-[#1C1B18] mb-2">30x</p>
              <p className="text-sm text-[#6B6A63]">Cheaper than standard 0.30% pools</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl text-[#1C1B18] mb-2">4</p>
              <p className="text-sm text-[#6B6A63]">Chains monitored simultaneously</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
        <div className="max-w-2xl mb-14">
          <p className="text-xs font-semibold tracking-widest text-[#A17D2F] uppercase mb-3">How it works</p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl text-[#1C1B18] leading-tight">
            One configuration.<br />Zero manual steps.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {FEATURES.map((feature) => (
            <div key={feature.number} className="group">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-mono text-[#9C9B93]">{feature.number}</span>
                <span className="flex-1 h-px bg-[#E4E2DC] group-hover:bg-[#A17D2F] transition-colors" />
                <span className="text-xs font-medium text-[#A17D2F]">{feature.detail}</span>
              </div>
              <h3 className="text-lg font-semibold text-[#1C1B18] mb-2">{feature.title}</h3>
              <p className="text-sm text-[#6B6A63] leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Steps ─── */}
      <section className="border-y border-[#E4E2DC] bg-white">
        <div className="max-w-4xl mx-auto px-6 py-20 sm:py-24">
          <p className="text-xs font-semibold tracking-widest text-[#A17D2F] uppercase mb-10 text-center">The Flow</p>
          <div className="space-y-0">
            {STEPS.map((item, i) => (
              <div key={item.step} className="flex items-start gap-6 py-5 border-b border-[#EDEBE6] last:border-0">
                <span className="font-[family-name:var(--font-display)] text-3xl text-[#E4E2DC] leading-none pt-0.5">
                  {item.step}
                </span>
                <p className="text-base sm:text-lg text-[#1C1B18] leading-relaxed pt-1">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── On-Chain Proof ─── */}
      <section className="max-w-4xl mx-auto px-6 py-20 sm:py-24">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold tracking-widest text-[#A17D2F] uppercase mb-3">Deployed</p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl text-[#1C1B18]">
            Live on Base mainnet
          </h2>
        </div>

        <div className="bg-white border border-[#E4E2DC] rounded-xl overflow-hidden">
          <div className="divide-y divide-[#EDEBE6]">
            {[
              ['Hook Contract', '0xA5Cb63B540D4334F01346F3D4C51d5B2fFf050c0'],
              ['Pool ID', '0xa0d5acc69bb0869...ec2821d169'],
              ['Pool Manager', '0x498581fF718922c3f8e6A244956aF099B2652b2b'],
              ['Dynamic Fee', '0.01% (100 hundredths of a bip)'],
              ['Chain', 'Base (8453)'],
              ['Oracle', '0x999A8DBc672A0DA86471e67b9A22eA2B1c91e101'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between px-6 py-4">
                <span className="text-sm text-[#6B6A63]">{label}</span>
                <span className="text-sm font-mono text-[#1C1B18] text-right max-w-[60%] truncate">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-[#E4E2DC]">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-[#1C1B18] flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="text-[#F8F7F4]">
                <path d="M8 1L14.5 5V11L8 15L1.5 11V5L8 1Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-sm font-medium text-[#1C1B18]">PayAgent</span>
          </div>
          <p className="text-xs text-[#9C9B93]">
            Built for ETHGlobal HackMoney 2026
          </p>
          <div className="flex items-center gap-4 text-xs text-[#9C9B93]">
            <a
              href="https://basescan.org/address/0xA5Cb63B540D4334F01346F3D4C51d5B2fFf050c0"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#1C1B18] transition-colors"
            >
              BaseScan
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#1C1B18] transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

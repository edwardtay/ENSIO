import { http, createStorage, cookieStorage } from 'wagmi'
import { mainnet, base } from 'wagmi/chains'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'

// Stub indexedDB on the server so WalletConnect's EthereumProvider
// constructor doesn't throw a ReferenceError during Next.js SSG.
// The stub is inert — WalletConnect catches downstream failures
// internally and only uses real indexedDB on the client.
if (typeof globalThis.indexedDB === 'undefined') {
  // @ts-expect-error — minimal stub, not a full IDB implementation
  globalThis.indexedDB = { open: () => ({}) }
}

// Lazy singleton — avoids re-creating the config on every render.
let _config: ReturnType<typeof getDefaultConfig> | null = null

export function getConfig() {
  if (!_config) {
    _config = getDefaultConfig({
      appName: 'AcceptAny',
      projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'demo',
      chains: [mainnet, base],
      ssr: true,
      storage: createStorage({ storage: cookieStorage }),
      transports: {
        [mainnet.id]: http(),
        [base.id]: http(),
      },
    })
  }
  return _config
}

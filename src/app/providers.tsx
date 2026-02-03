'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { type State, WagmiProvider } from 'wagmi'
import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit'
import { getConfig } from '@/config/wagmi'
import '@rainbow-me/rainbowkit/styles.css'

type Props = { children: ReactNode; initialState?: State }

export function Providers({ children, initialState }: Props) {
  const [queryClient] = useState(() => new QueryClient())
  const [config] = useState(() => getConfig())
  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={lightTheme({
          accentColor: '#1C1B18',
          accentColorForeground: '#FAFAF7',
          borderRadius: 'medium',
          fontStack: 'system',
          overlayBlur: 'small',
        })}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

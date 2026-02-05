# AcceptAny

Accept any token on any chain. Auto-convert to USDC and earn yield.

## How It Works

1. **Configure your ENS** — Connect wallet, pick a yield vault (Aave, Morpho)
2. **Share your payment link** — `yieldroute.xyz/pay/yourname.eth`
3. **Receive any token** — Sender pays with any token from any chain
4. **Auto-convert + deposit** — Funds bridge to Base, convert to USDC, deposit to vault
5. **Earn yield** — Your vault balance grows automatically

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  RECEIVER DASHBOARD (/app)                                   │
│  - Connect wallet, see ENS name                              │
│  - Configure yield vault (Aave/Morpho)                       │
│  - View vault balance, APY, earnings                         │
│  - See incoming payments                                     │
│  - Copy payment link                                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  PAYMENT PAGE (/pay/[ens])                                   │
│  - Sender picks any token from their wallet                  │
│  - LI.FI quotes swap + bridge route                          │
│  - One-click payment execution                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  LI.FI BRIDGE                                                │
│  - Swap sender's token → USDC                                │
│  - Bridge to Base via CCTP                                   │
│  - Destination call → YieldRouter                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  UNISWAP V4 HOOK (YieldHook)                                 │
│  - Reads recipient's vault from ENS                          │
│  - Deposits USDC into ERC-4626 vault                         │
│  - Vault shares credited to recipient                        │
└─────────────────────────────────────────────────────────────┘
```

## Features

**Receiver Dashboard** — ENS-centric dashboard showing vault balance, APY, yield earned, and incoming payments. One-click vault configuration saved to ENS.

**Any Token Payment** — Senders pay with any token from any chain. LI.FI handles swap + bridge routing automatically.

**Real-time Vault Data** — Live APY from DeFiLlama, on-chain vault balance and share conversion.

**ENS Integration** — Vault preference stored in `yieldroute.vault` ENS text record. Payment link is just your ENS name.

**Uniswap V4 Hook** — `YieldHook` reads ENS, deposits to recipient's chosen ERC-4626 vault in `afterSwap`.

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Setup

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open http://localhost:3000/app

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_WC_PROJECT_ID` | No | WalletConnect project ID |
| `ETH_RPC_URL` | No | Ethereum RPC for ENS (defaults to llamarpc) |
| `BASE_RPC_URL` | No | Base RPC for vault queries (defaults to base.org) |

### Contracts

```bash
cd contracts
forge build
forge test -vv
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Cross-chain | LI.FI SDK |
| ENS | viem (getEnsAddress, getEnsText) |
| Wallets | RainbowKit + wagmi v2 |
| Yield Data | DeFiLlama API + on-chain ERC-4626 |
| Contracts | Foundry + Uniswap v4 hooks |

## Yield Vaults

Currently supported on Base:

| Vault | Protocol | Token |
|-------|----------|-------|
| Aave USDC | Aave v3 | USDC |
| Morpho USDC | Morpho | USDC |

Custom ERC-4626 vaults also supported.

## License

MIT

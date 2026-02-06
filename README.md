# FlowFi

Accept any token on any chain. Auto-convert to your preferred DeFi strategy.

## How It Works

1. **Get your payment link** — Connect wallet with ENS → get `flowfi.xyz/pay/yourname.eth`
2. **Choose your strategy** — Yield vaults, restaking, or liquid USDC
3. **Share your link** — Anyone can pay you with any token from any chain
4. **Auto-route to DeFi** — Payments bridge to Base and deposit to your chosen strategy

## Strategies

| Strategy | Output | Protocol | Use Case |
|----------|--------|----------|----------|
| **Yield** | USDC → Vault | Aave, Morpho | Earn 4-8% APY on stablecoins |
| **Restaking** | WETH → ezETH | Renzo | Earn EigenLayer points |
| **Liquid** | USDC | Direct | Keep funds liquid |

Split across multiple strategies: `yield:50,restaking:30,liquid:20`

## Architecture

```
Sender (any chain, any token)
         │
         ▼
┌─────────────────────────────────────┐
│  LI.FI Aggregator                   │
│  - Swap to destination token        │
│  - Bridge to Base via CCTP          │
│  - Contract Call on arrival         │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Strategy Router (Base)             │
│  - YieldRouter → ERC-4626 vault     │
│  - RestakingRouter → Renzo ezETH    │
│  - Direct transfer → wallet         │
└─────────────────────────────────────┘
         │
         ▼
    Recipient's DeFi position
```

## Yield Vaults (Base)

| Risk | Vault | Protocol |
|------|-------|----------|
| Low | Aave USDC | Aave v3 |
| Low | Moonwell USDC | Moonwell |
| Medium | Gauntlet Prime | Morpho |
| Medium | Seamless USDC | Morpho |
| Medium | Spark USDC | Morpho |
| High | Gauntlet Frontier | Morpho |
| High | Steakhouse RWA | Morpho |
| High | Re7 RWA | Morpho |

## ENS Configuration

Your DeFi preferences are stored in ENS text records:

| Record | Example | Description |
|--------|---------|-------------|
| `flowfi.strategy` | `yield` | Single strategy |
| `flowfi.strategies` | `yield:50,restaking:50` | Multi-strategy split |
| `yieldroute.vault` | `0x4e65...` | Specific vault address |

## Deployed Contracts (Base Mainnet)

| Contract | Address |
|----------|---------|
| YieldRouter | `0xE132329262224f5EEd5BCA1ee64768cf437308d8` |
| RestakingRouter | `0x31549dB00B180d528f77083b130C0A045D0CF117` |
| PayAgentHook | `0xA5Cb63B540D4334F01346F3D4C51d5B2fFf050c0` |
| PoolManager | `0x498581fF718922c3f8e6A244956aF099B2652b2b` |

## Uniswap v4 Integration

FlowFi uses a custom Uniswap v4 hook (`PayAgentHook`) for on-chain dynamic fees.

**Example Swap Transaction:**
- TX: [0x37fe2ada...0b005f7d](https://basescan.org/tx/0x37fe2adaa33bf41b8c1969dd124ed7672c001c5f06791e58dda50cff0b005f7d)
- Pool ID: `0xa0d5acc69bb086910e2483f8fc8d6c850bfe0a0240ba280f651984ec2821d169`
- Hook events visible in tx logs:
  - `SwapProcessed` — tracks swap count per pool
  - `VolumeUpdated` — tracks actual volume from BalanceDelta

**Pool Stats (live on-chain):**
- Swap count: 15
- Total volume: ~70 USDC
- Fee: 0.01% (dynamic, admin-configurable)

**Hook Features:**
- Per-pool admin control (set on initialization)
- Pluggable `IFeeStrategy` for custom fee logic
- Timelock on fee changes (150 blocks / ~5 min)
- Max fee capped at 1% to prevent extraction

## LI.FI Integration

FlowFi uses LI.FI for cross-chain swaps and aggregated routing across 30+ chains.

**Example Swap Transaction:**
- TX: [0x6468fa14...8822ff40](https://basescan.org/tx/0x6468fa144a6526032e24f1aaddde8c48e0ce4b648361721085855c3f8822ff40)
- Route: 0.5 USDC → 0.502 USDT on Base
- Integrator: `flowfi`
- Via: LI.FI Diamond (SushiSwap Aggregator)

**Cross-Chain Flow:**
1. User pays with any token on any supported chain
2. LI.FI finds optimal route (swap + bridge)
3. Contract Call executes on Base (YieldRouter or RestakingRouter)
4. Funds arrive in recipient's chosen DeFi strategy

## AI Payment Agent

FlowFi includes an autonomous AI agent powered by Groq LLM that understands natural language and executes transactions.

**Natural Language → Transaction:**

```bash
# Tell the agent what you want in plain English
curl -X POST /api/agent/cron \
  -d '{"action":"ai","message":"swap 0.02 USDC to USDT on base"}'

# AI parses intent, executes via Uniswap v4
→ { "txHash": "0xd8b54b9e...", "via": "Uniswap v4 + PayAgentHook" }
```

**AI-Executed Transactions (Real):**

| Input | Action | TX |
|-------|--------|-----|
| "swap 0.02 USDC to USDT on base" | V4 Swap | [0xd8b54b9e...](https://basescan.org/tx/0xd8b54b9e696df7b937372afeac6ca7071676dec713b95d3615b372745196bf76) |
| API trigger | V4 Swap | [0x4be074c2...](https://basescan.org/tx/0x4be074c227df8c2806c2939f11cf9ff4e89e8316498333716b614bd10f9f846b) |
| API trigger | LI.FI Swap | [0x905a9c5a...](https://basescan.org/tx/0x905a9c5a75ece7158372b26cc161b30dd4ec17309ef6afabd158f83de73b6838) |

**Supported Intents:**

| Intent | Example | Execution |
|--------|---------|-----------|
| Pay | "pay vitalik.eth 100 USDC" | LI.FI cross-chain |
| Swap | "swap 50 USDC to USDT" | Uniswap v4 |
| Subscribe | "send alice 25 USDC monthly" | Scheduled payments |
| Bridge | "bridge 0.1 ETH to base" | LI.FI bridge |

**Autonomous Decision Loop:**

```
Monitor → Decide → Act

1. MONITOR: Check gas tanks for all receivers
2. DECIDE: AI analyzes situation, recommends action
3. ACT: Execute refills via LI.FI + Uniswap v4
```

```bash
# Ask AI to analyze and decide
curl /api/agent/cron?action=decide

→ { "shouldAct": true, "reasoning": "Gas tanks low, optimal time to refill" }
```

**Tech Stack:**
- LLM: Groq (Llama 3.3 70B) for intent parsing
- Execution: Uniswap v4 + LI.FI SDK
- Hook: PayAgentHook for dynamic fees

## ENS Subdomains for Invoices

FlowFi creates ENS subdomains for invoices, demonstrating deeper ENS integration:

```
inv-{invoiceId}.yourname.eth → invoice data
```

**Features:**
- Each invoice gets its own subdomain
- Invoice hash stored as text record
- Payment URL: `flowfi.xyz/pay/inv-123.yourname.eth`
- Verifiable on-chain invoice proof

## ENS CCIP-Read Offchain Resolver

FlowFi implements EIP-3668 (CCIP-Read) for dynamic offchain data resolution:

**Supported Wildcard Subdomains:**

| Pattern | Returns | Example |
|---------|---------|---------|
| `apy.name.eth` | Current vault APY | `5.50%` |
| `status.inv-{id}.name.eth` | Invoice status | `pending` |
| `pay-{amount}-{token}.name.eth` | Payment request | Pre-filled payment |
| `tx-{hash}.payments.name.eth` | Receipt data | Payment proof |

**How It Works:**
1. ENS client queries `apy.alice.eth`
2. Resolver reverts with `OffchainLookup` pointing to gateway
3. Gateway (`/api/ens/gateway`) returns dynamic APY data
4. Client receives live yield rates without on-chain storage

**Gateway Endpoint:**
```
GET /api/ens/gateway/{sender}/{data}.json
```

This shows ENS is more than key-value storage — it's a decentralized data layer.

## Getting Started

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open http://localhost:3000

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Cross-chain | LI.FI SDK + Contract Calls |
| ENS | viem |
| Wallets | RainbowKit + wagmi |
| Yield Data | DeFiLlama + on-chain ERC-4626 |

## License

MIT

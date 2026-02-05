# Uniswap v4 Hooks Design: MEV Protection & Streaming Payments

## Overview

Two new hooks that provide functionality LI.FI cannot replicate:

1. **MEVProtectionHook** - Chainlink oracle price verification to block sandwich attacks
2. **StreamingPaymentHook** - Convert instant payments into linear streams

## Hook Architecture

### LI.FI vs Hooks Separation

| LI.FI Territory | Hook Territory |
|-----------------|----------------|
| Cross-chain bridging | Dynamic fees |
| Multi-DEX routing | MEV protection (oracle checks) |
| Contract Calls after swap | Streaming payments |
| Yield deposits (via YieldRouter) | On-chain preference enforcement |

---

## 1. MEVProtectionHook

**Location**: `stableroute/contracts/src/MEVProtectionHook.sol`

### Purpose
Protect swap users from sandwich attacks by verifying execution price against Chainlink oracles.

### How It Works
```
1. Frontend calculates expected output based on current pool state
2. Frontend passes (expectedAmountIn, expectedAmountOut) in hookData
3. Hook fetches Chainlink prices for both tokens
4. Calculates implied price vs oracle price
5. If divergence > threshold (default 1%), reverts with PriceManipulated
```

### Key Features
- Per-pool Chainlink price feed configuration
- Configurable divergence threshold (max 5%)
- Graceful degradation if oracle is stale (>1 hour)
- Admin can enable/disable per pool

### Chainlink Feeds on Base
- USDC/USD: `0x7e860098F58bBFC8648a4311b374B1D669a2bc6B`
- ETH/USD: `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70`
- USDT/USD: Check Base Chainlink docs

### Usage
```solidity
// Configure pool
mevHook.configurePool(poolKey, usdcFeed, usdtFeed, 100); // 1% max divergence

// Swap with protection (frontend encodes hookData)
bytes memory hookData = abi.encode(amountIn, expectedAmountOut);
poolManager.swap(key, params, hookData);
```

---

## 2. StreamingPaymentHook

**Location**: `stableroute/contracts/src/StreamingPaymentHook.sol`

### Purpose
Convert instant swap output into a linear stream that recipient claims over time.

### Use Cases
- Salary payments (weekly/monthly vesting)
- Subscription payments
- Escrow with gradual release
- Contractor payments with milestones

### How It Works
```
1. Swap executes normally
2. afterSwap intercepts output tokens
3. Creates stream: (sender, recipient, token, amount, duration)
4. Recipient calls claim() to withdraw vested tokens
5. Sender can cancel() and get refund of unvested amount
```

### Key Features
- Linear vesting over configurable duration (1 min to 365 days)
- Default 7-day stream duration
- Recipients can set their preferred default duration
- Sender can cancel and reclaim unvested tokens
- Batch claim via `claimAll()`

### Stream Lifecycle
```
Created ─────────────────────────────── Ended
    │                                      │
    ├──> claim() ──> partial withdrawal    │
    │                                      │
    └──> cancel() ──> refund unvested ─────┘
```

### Usage
```solidity
// Recipient sets preferred stream duration
streamHook.setDefaultDuration(7 days);

// Sender swaps with streaming (hookData encodes recipient + duration)
bytes memory hookData = abi.encode(recipient, 7 days);
poolManager.swap(key, params, hookData);

// Recipient claims vested tokens
streamHook.claim(streamId);
// or
streamHook.claimAll();
```

---

## Integration with AcceptAny

### Payment Flow Options

1. **Instant Payment** (default)
   - LI.FI routes cross-chain
   - Direct transfer to recipient

2. **Instant + Yield** (current)
   - LI.FI routes cross-chain
   - YieldRouter deposits to vault

3. **Streaming Payment** (new)
   - Same-chain swap via v4
   - StreamingPaymentHook creates stream
   - Recipient claims over time

4. **Protected Swap** (new)
   - Same-chain swap via v4
   - MEVProtectionHook verifies oracle price
   - Reverts if sandwich detected

### ENS Integration

Recipients can set preferences:
- `yieldroute.vault` - ERC-4626 vault address
- `acceptany.stream.duration` - Default stream duration (seconds)
- `acceptany.mev.enabled` - Enable MEV protection

---

## Deployment

```bash
# Deploy hooks
forge script script/DeployHooks.s.sol --rpc-url base --broadcast

# Configure pools with Chainlink feeds
forge script script/ConfigureMEV.s.sol --rpc-url base --broadcast
```

## Testing

```bash
forge test --match-contract MEVProtectionHookTest
forge test --match-contract StreamingPaymentHookTest
```

# YieldRoute Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pay to any ENS name with any token from any chain. Funds auto-deposit into receiver's ERC-4626 yield vault.

**Architecture:** LI.FI bridges funds cross-chain with a destination call to YieldRouter on Base. YieldRouter routes through a V4 pool where YieldHook reads ENS text records and deposits to the receiver's chosen ERC-4626 vault.

**Tech Stack:** Foundry (Solidity 0.8.26), Next.js 15, viem, wagmi, RainbowKit, LI.FI SDK, Tailwind + shadcn/ui

**Existing code to leverage:**
- `src/lib/ens/resolve.ts` - ENS resolution with custom text records
- `src/lib/routing/lifi-router.ts` - LI.FI routing with Composer and Contract Calls
- `contracts/src/PayAgentHook.sol` - V4 hook base (fee strategies)

---

## Task 1: YieldHook Contract - Core Structure

**Files:**
- Create: `contracts/src/YieldHook.sol`
- Reference: `contracts/src/PayAgentHook.sol`

**Step 1: Create the YieldHook contract skeleton**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

/// @title YieldHook
/// @notice Uniswap v4 hook that deposits swap output into receiver's ERC-4626 vault
contract YieldHook is BaseHook {
    using PoolIdLibrary for PoolKey;

    error InvalidVault();
    error DepositFailed();

    event YieldDeposited(
        address indexed recipient,
        address indexed vault,
        uint256 amount,
        uint256 shares
    );

    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {}

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: false,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function afterSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) external override onlyPoolManager returns (bytes4, int128) {
        // Decode recipient and vault from hookData
        if (hookData.length == 0) {
            return (this.afterSwap.selector, 0);
        }

        (address recipient, address vault) = abi.decode(hookData, (address, address));

        if (vault == address(0)) {
            return (this.afterSwap.selector, 0);
        }

        // Get the output token and amount
        Currency outputCurrency = params.zeroForOne ? key.currency1 : key.currency0;
        int128 outputAmount = params.zeroForOne ? delta.amount1() : delta.amount0();

        // Only process if we received tokens (negative delta means tokens out of pool to user)
        if (outputAmount >= 0) {
            return (this.afterSwap.selector, 0);
        }

        uint256 depositAmount = uint256(uint128(-outputAmount));
        address token = Currency.unwrap(outputCurrency);

        // Deposit to vault
        _depositToVault(token, vault, recipient, depositAmount);

        return (this.afterSwap.selector, 0);
    }

    function _depositToVault(
        address token,
        address vault,
        address recipient,
        uint256 amount
    ) internal {
        // Approve vault to spend tokens
        IERC20(token).approve(vault, amount);

        // Deposit and credit shares to recipient
        uint256 shares = IERC4626(vault).deposit(amount, recipient);

        emit YieldDeposited(recipient, vault, amount, shares);
    }
}
```

**Step 2: Verify it compiles**

Run: `cd stableroute/contracts && forge build`
Expected: Compilation successful

**Step 3: Commit**

```bash
git add contracts/src/YieldHook.sol
git commit -m "feat(contracts): add YieldHook skeleton with afterSwap vault deposit"
```

---

## Task 2: YieldRouter Contract

**Files:**
- Create: `contracts/src/YieldRouter.sol`

**Step 1: Create YieldRouter that receives LI.FI calls**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

/// @title YieldRouter
/// @notice Entry point for LI.FI destination calls. Routes funds to yield vaults.
contract YieldRouter {
    IPoolManager public immutable poolManager;
    PoolSwapTest public immutable swapRouter;

    // Mapping of token -> default vault (can be overridden per-call)
    mapping(address => address) public defaultVaults;

    address public owner;

    error Unauthorized();
    error InvalidAmount();
    error TransferFailed();

    event DepositRouted(
        address indexed recipient,
        address indexed token,
        address indexed vault,
        uint256 amount
    );

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(IPoolManager _poolManager, PoolSwapTest _swapRouter) {
        poolManager = _poolManager;
        swapRouter = _swapRouter;
        owner = msg.sender;
    }

    /// @notice Set default vault for a token
    function setDefaultVault(address token, address vault) external onlyOwner {
        defaultVaults[token] = vault;
    }

    /// @notice Main entry point - called by LI.FI after bridging
    /// @param recipient The final recipient (ENS-resolved address)
    /// @param vault The ERC-4626 vault to deposit into (from ENS text record)
    /// @param token The token being deposited (USDC)
    /// @param amount The amount to deposit
    function depositToYield(
        address recipient,
        address vault,
        address token,
        uint256 amount
    ) external {
        if (amount == 0) revert InvalidAmount();

        // Pull tokens from caller (LI.FI executor)
        bool success = IERC20(token).transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();

        // Use provided vault or fall back to default
        address targetVault = vault != address(0) ? vault : defaultVaults[token];

        if (targetVault != address(0)) {
            // Deposit to ERC-4626 vault
            IERC20(token).approve(targetVault, amount);
            IERC4626(targetVault).deposit(amount, recipient);
        } else {
            // No vault configured - send directly to recipient
            IERC20(token).transfer(recipient, amount);
        }

        emit DepositRouted(recipient, token, targetVault, amount);
    }

    /// @notice Alternative entry with swap through V4 pool first
    /// @dev Used when incoming token needs to be swapped before vault deposit
    function swapAndDeposit(
        address recipient,
        address vault,
        PoolKey calldata poolKey,
        IPoolManager.SwapParams calldata swapParams
    ) external {
        // hookData encodes recipient + vault for YieldHook
        bytes memory hookData = abi.encode(recipient, vault);

        // Execute swap - YieldHook.afterSwap handles the deposit
        swapRouter.swap(poolKey, swapParams, PoolSwapTest.TestSettings({
            takeClaims: false,
            settleUsingBurn: false
        }), hookData);
    }
}
```

**Step 2: Verify it compiles**

Run: `cd stableroute/contracts && forge build`
Expected: Compilation successful (may need to install v4-periphery)

**Step 3: Commit**

```bash
git add contracts/src/YieldRouter.sol
git commit -m "feat(contracts): add YieldRouter for LI.FI destination calls"
```

---

## Task 3: Install V4 Periphery Dependencies

**Files:**
- Modify: `contracts/foundry.toml`
- Modify: `contracts/remappings.txt`

**Step 1: Install v4-periphery**

Run:
```bash
cd stableroute/contracts && forge install uniswap/v4-periphery --no-commit
```

**Step 2: Update remappings.txt**

Add to `contracts/remappings.txt`:
```
v4-periphery/=lib/v4-periphery/
@uniswap/v4-periphery/=lib/v4-periphery/
```

**Step 3: Verify build**

Run: `cd stableroute/contracts && forge build`
Expected: Compilation successful

**Step 4: Commit**

```bash
git add contracts/
git commit -m "chore(contracts): install v4-periphery dependency"
```

---

## Task 4: YieldHook Unit Tests

**Files:**
- Create: `contracts/test/YieldHook.t.sol`

**Step 1: Write test file**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {YieldHook} from "../src/YieldHook.sol";

// Minimal ERC4626 mock for testing
contract MockVault {
    MockERC20 public asset;
    mapping(address => uint256) public balanceOf;

    constructor(MockERC20 _asset) {
        asset = _asset;
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        asset.transferFrom(msg.sender, address(this), assets);
        shares = assets; // 1:1 for simplicity
        balanceOf[receiver] += shares;
        return shares;
    }
}

contract YieldHookTest is Test, Deployers {
    YieldHook hook;
    MockERC20 token0;
    MockERC20 token1;
    MockVault vault;
    PoolKey poolKey;

    function setUp() public {
        deployFreshManagerAndRouters();

        // Deploy tokens
        token0 = new MockERC20("Token0", "T0", 18);
        token1 = new MockERC20("USDC", "USDC", 6);

        // Deploy vault for token1 (USDC)
        vault = new MockVault(token1);

        // Deploy hook at correct address
        uint160 flags = uint160(Hooks.AFTER_SWAP_FLAG);
        address hookAddress = address(flags);

        deployCodeTo("YieldHook.sol", abi.encode(manager), hookAddress);
        hook = YieldHook(hookAddress);

        // Sort tokens
        (Currency currency0, Currency currency1) = address(token0) < address(token1)
            ? (Currency.wrap(address(token0)), Currency.wrap(address(token1)))
            : (Currency.wrap(address(token1)), Currency.wrap(address(token0)));

        // Create pool
        poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        manager.initialize(poolKey, SQRT_PRICE_1_1);
    }

    function test_hookPermissions() public view {
        Hooks.Permissions memory perms = hook.getHookPermissions();
        assertFalse(perms.beforeSwap);
        assertTrue(perms.afterSwap);
    }
}
```

**Step 2: Run tests**

Run: `cd stableroute/contracts && forge test --match-contract YieldHookTest -vvv`
Expected: Tests pass

**Step 3: Commit**

```bash
git add contracts/test/YieldHook.t.sol
git commit -m "test(contracts): add YieldHook unit tests"
```

---

## Task 5: Update ENS Text Record Keys

**Files:**
- Modify: `src/lib/ens/resolve.ts`
- Modify: `src/lib/types.ts`

**Step 1: Add vault field to ENSResolution type**

In `src/lib/types.ts`, update ENSResolution:

```typescript
export interface ENSResolution {
  address: `0x${string}` | null
  preferredChain?: string
  preferredToken?: string
  preferredSlippage?: string
  maxFee?: string
  autoConsolidate?: string
  avatar?: string
  description?: string
  // New: YieldRoute fields
  yieldVault?: string
}
```

**Step 2: Update resolve.ts to read yieldroute.vault**

In `src/lib/ens/resolve.ts`, add to the keys array:

```typescript
const keys = [
  'com.payagent.chain',
  'com.payagent.token',
  'com.payagent.slippage',
  'com.payagent.maxFee',
  'com.payagent.autoconsolidate',
  'avatar',
  'description',
  'yieldroute.vault', // Add this
] as const
```

And in the results handling:

```typescript
// After existing assignments
const yieldVault = results[7]
```

And in the return:

```typescript
return {
  address,
  preferredChain,
  preferredToken,
  preferredSlippage,
  maxFee,
  autoConsolidate,
  avatar,
  description,
  yieldVault, // Add this
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd stableroute && pnpm build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/ens/resolve.ts src/lib/types.ts
git commit -m "feat(ens): add yieldroute.vault text record support"
```

---

## Task 6: Add LI.FI Destination Call Builder

**Files:**
- Create: `src/lib/routing/yield-router.ts`

**Step 1: Create yield router helper**

```typescript
import { getContractCallsQuote, executeRoute, type Route } from '@lifi/sdk'
import { encodeFunctionData } from 'viem'
import { CHAIN_MAP, getTokenAddress, getTokenDecimals } from './tokens'

// YieldRouter ABI (just the function we need)
const YIELD_ROUTER_ABI = [
  {
    name: 'depositToYield',
    type: 'function',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'vault', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

// Deployed YieldRouter address on Base
export const YIELD_ROUTER_ADDRESS = '0x0000000000000000000000000000000000000000' // TODO: Deploy and update

export interface YieldRouteParams {
  fromAddress: string
  fromChain: string
  fromToken: string
  amount: string
  recipient: string // ENS-resolved address
  vault: string // ERC-4626 vault address from ENS
  slippage?: number
}

export async function getYieldRouteQuote(params: YieldRouteParams) {
  const fromChainId = CHAIN_MAP[params.fromChain] || CHAIN_MAP.ethereum
  const toChainId = CHAIN_MAP.base // Always Base
  const fromTokenAddr = getTokenAddress(params.fromToken, fromChainId)
  const toTokenAddr = getTokenAddress('USDC', toChainId) // Always USDC on Base

  if (!fromTokenAddr || !toTokenAddr) {
    throw new Error(`Token not supported: ${params.fromToken}`)
  }

  const decimals = getTokenDecimals(params.fromToken)
  const amountWei = BigInt(
    Math.floor(parseFloat(params.amount) * 10 ** decimals)
  ).toString()

  // Build the destination call data
  const callData = encodeFunctionData({
    abi: YIELD_ROUTER_ABI,
    functionName: 'depositToYield',
    args: [
      params.recipient as `0x${string}`,
      params.vault as `0x${string}`,
      toTokenAddr as `0x${string}`,
      BigInt(amountWei),
    ],
  })

  // Get quote with contract call
  const quote = await getContractCallsQuote({
    fromAddress: params.fromAddress,
    fromChain: fromChainId,
    fromToken: fromTokenAddr,
    toChain: toChainId,
    toToken: toTokenAddr,
    toAmount: amountWei,
    contractCalls: [
      {
        fromAmount: amountWei,
        fromTokenAddress: toTokenAddr,
        toContractAddress: YIELD_ROUTER_ADDRESS,
        toContractCallData: callData,
        toContractGasLimit: '300000',
      },
    ],
    slippage: params.slippage || 0.005,
  })

  return quote
}

export async function executeYieldRoute(route: Route) {
  return executeRoute(route)
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd stableroute && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/lib/routing/yield-router.ts
git commit -m "feat(routing): add LI.FI destination call builder for YieldRouter"
```

---

## Task 7: Payment Page - Route Component

**Files:**
- Create: `src/app/pay/[ens]/page.tsx`

**Step 1: Create the payment page**

```tsx
import { Suspense } from 'react'
import { PaymentFlow } from './payment-flow'

interface Props {
  params: Promise<{ ens: string }>
}

export default async function PayPage({ params }: Props) {
  const { ens } = await params

  return (
    <main className="min-h-screen bg-[#FAF9F6] p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        <Suspense fallback={<div className="text-center">Loading...</div>}>
          <PaymentFlow ensName={ens} />
        </Suspense>
      </div>
    </main>
  )
}
```

**Step 2: Create payment-flow.tsx**

Create: `src/app/pay/[ens]/payment-flow.tsx`

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useAccount, useBalance, useChainId } from 'wagmi'
import { formatUnits, parseUnits } from 'viem'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  ensName: string
}

interface RecipientInfo {
  address: string | null
  vault?: string
  preferredToken?: string
  preferredChain?: string
}

export function PaymentFlow({ ensName }: Props) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const [amount, setAmount] = useState('')
  const [recipientInfo, setRecipientInfo] = useState<RecipientInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch recipient ENS info
  useEffect(() => {
    async function fetchRecipient() {
      try {
        const res = await fetch(`/api/ens/resolve?name=${ensName}`)
        if (!res.ok) throw new Error('Failed to resolve ENS')
        const data = await res.json()
        setRecipientInfo(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load recipient')
      } finally {
        setLoading(false)
      }
    }
    fetchRecipient()
  }, [ensName])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          Resolving {ensName}...
        </CardContent>
      </Card>
    )
  }

  if (error || !recipientInfo?.address) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-red-600">
          {error || `Could not resolve ${ensName}`}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pay to {ensName}</CardTitle>
          <p className="text-sm text-muted-foreground font-mono">
            {recipientInfo.address?.slice(0, 6)}...{recipientInfo.address?.slice(-4)}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {recipientInfo.vault && (
            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
              Funds will be deposited into yield vault
            </div>
          )}

          <div>
            <label className="text-sm font-medium">Amount (USDC)</label>
            <Input
              type="number"
              placeholder="100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
            />
          </div>

          {!isConnected ? (
            <ConnectButton />
          ) : (
            <Button className="w-full" disabled={!amount || parseFloat(amount) <= 0}>
              Pay ${amount || '0'} USDC
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 3: Verify it builds**

Run: `cd stableroute && pnpm build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/app/pay/
git commit -m "feat(ui): add payment page skeleton for ENS payments"
```

---

## Task 8: ENS Resolve API Route

**Files:**
- Create: `src/app/api/ens/resolve/route.ts`

**Step 1: Create the API route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { resolveENS } from '@/lib/ens/resolve'

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name')

  if (!name) {
    return NextResponse.json({ error: 'Missing name parameter' }, { status: 400 })
  }

  try {
    const result = await resolveENS(name)
    return NextResponse.json(result)
  } catch (error) {
    console.error('ENS resolve error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Resolution failed' },
      { status: 500 }
    )
  }
}
```

**Step 2: Verify it builds**

Run: `cd stableroute && pnpm build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/app/api/ens/resolve/route.ts
git commit -m "feat(api): add ENS resolve endpoint"
```

---

## Task 9: Config UI Page

**Files:**
- Create: `src/app/app/page.tsx`
- Create: `src/app/app/config-form.tsx`

**Step 1: Create the config page**

```tsx
import { Suspense } from 'react'
import { ConfigForm } from './config-form'

export default function AppPage() {
  return (
    <main className="min-h-screen bg-[#FAF9F6] p-4 md:p-8">
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-semibold mb-6">YieldRoute</h1>
        <Suspense fallback={<div>Loading...</div>}>
          <ConfigForm />
        </Suspense>
      </div>
    </main>
  )
}
```

**Step 2: Create config-form.tsx**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useAccount, useEnsName } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Known ERC-4626 vaults on Base
const VAULTS = [
  { address: '0x0000000000000000000000000000000000000000', name: 'Aave USDC', apy: '4.2%' },
  { address: '0x0000000000000000000000000000000000000001', name: 'Moonwell USDC', apy: '5.1%' },
] as const

export function ConfigForm() {
  const { address, isConnected } = useAccount()
  const { data: ensName } = useEnsName({ address })
  const [selectedVault, setSelectedVault] = useState<string>('')
  const [customVault, setCustomVault] = useState('')

  if (!isConnected) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="mb-4">Connect your wallet to configure YieldRoute</p>
          <ConnectButton />
        </CardContent>
      </Card>
    )
  }

  if (!ensName) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">
            You need an ENS name to use YieldRoute.
          </p>
          <a
            href="https://app.ens.domains"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline mt-2 block"
          >
            Get an ENS name
          </a>
        </CardContent>
      </Card>
    )
  }

  const paymentLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/pay/${ensName}`

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Welcome, {ensName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Your Payment Link</label>
            <div className="mt-1 flex gap-2">
              <Input value={paymentLink} readOnly className="font-mono text-sm" />
              <Button
                variant="outline"
                onClick={() => navigator.clipboard.writeText(paymentLink)}
              >
                Copy
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Yield Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Deposit into vault</label>
            <Select value={selectedVault} onValueChange={setSelectedVault}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a vault" />
              </SelectTrigger>
              <SelectContent>
                {VAULTS.map((v) => (
                  <SelectItem key={v.address} value={v.address}>
                    {v.name} ({v.apy} APY)
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom vault address</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedVault === 'custom' && (
            <div>
              <label className="text-sm font-medium">Vault Address</label>
              <Input
                placeholder="0x..."
                value={customVault}
                onChange={(e) => setCustomVault(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
          )}

          <Button className="w-full">Save to ENS</Button>
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 3: Verify it builds**

Run: `cd stableroute && pnpm build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/app/app/
git commit -m "feat(ui): add config page for ENS yield settings"
```

---

## Task 10: Deploy Contracts to Base Sepolia

**Files:**
- Create: `contracts/script/DeployYieldRoute.s.sol`

**Step 1: Create deployment script**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {YieldHook} from "../src/YieldHook.sol";
import {YieldRouter} from "../src/YieldRouter.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "../test/utils/HookMiner.sol";

contract DeployYieldRoute is Script {
    // Base Sepolia PoolManager
    address constant POOL_MANAGER = 0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408;
    // Base Sepolia PoolSwapTest (deploy separately or use existing)
    address constant SWAP_ROUTER = 0x0000000000000000000000000000000000000000;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        IPoolManager poolManager = IPoolManager(POOL_MANAGER);

        // Find salt for hook address with correct flags
        uint160 flags = uint160(Hooks.AFTER_SWAP_FLAG);

        // Mine for valid hook address
        (address hookAddress, bytes32 salt) = HookMiner.find(
            CREATE2_FACTORY,
            flags,
            type(YieldHook).creationCode,
            abi.encode(poolManager)
        );

        // Deploy YieldHook
        YieldHook hook = new YieldHook{salt: salt}(poolManager);
        console.log("YieldHook deployed to:", address(hook));

        // Deploy YieldRouter
        YieldRouter router = new YieldRouter(poolManager, PoolSwapTest(SWAP_ROUTER));
        console.log("YieldRouter deployed to:", address(router));

        vm.stopBroadcast();
    }
}
```

**Step 2: Deploy (manual step)**

Run:
```bash
cd stableroute/contracts
source .env
forge script script/DeployYieldRoute.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast
```

**Step 3: Commit**

```bash
git add contracts/script/DeployYieldRoute.s.sol
git commit -m "feat(contracts): add deployment script for Base Sepolia"
```

---

## Task 11: Wire Up Payment Execution

**Files:**
- Modify: `src/app/pay/[ens]/payment-flow.tsx`

**Step 1: Add quote fetching and execution**

Update payment-flow.tsx to include:
- Token selector dropdown
- Chain selector dropdown
- Real-time LI.FI quote
- Execute button that calls LI.FI

(Full implementation in previous task - this connects the UI to yield-router.ts)

**Step 2: Verify dev server works**

Run: `cd stableroute && pnpm dev`
Test: Navigate to `/pay/vitalik.eth` and verify UI loads

**Step 3: Commit**

```bash
git add src/app/pay/
git commit -m "feat(ui): wire payment flow to LI.FI execution"
```

---

## Task 12: ENS Write Integration

**Files:**
- Create: `src/lib/ens/write-records.ts`
- Modify: `src/app/app/config-form.tsx`

**Step 1: Create ENS write helper**

```typescript
import { createWalletClient, custom, encodeFunctionData } from 'viem'
import { mainnet } from 'viem/chains'
import { namehash, normalize } from 'viem/ens'

const PUBLIC_RESOLVER_ABI = [
  {
    name: 'setText',
    type: 'function',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
    outputs: [],
  },
] as const

// ENS Public Resolver on mainnet
const PUBLIC_RESOLVER = '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63'

export async function setENSTextRecord(
  ensName: string,
  key: string,
  value: string
) {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('No wallet connected')
  }

  const walletClient = createWalletClient({
    chain: mainnet,
    transport: custom(window.ethereum),
  })

  const [address] = await walletClient.getAddresses()
  const node = namehash(normalize(ensName))

  const hash = await walletClient.writeContract({
    address: PUBLIC_RESOLVER,
    abi: PUBLIC_RESOLVER_ABI,
    functionName: 'setText',
    args: [node, key, value],
    account: address,
  })

  return hash
}
```

**Step 2: Wire to config form**

Update config-form.tsx to call setENSTextRecord on save.

**Step 3: Commit**

```bash
git add src/lib/ens/write-records.ts src/app/app/config-form.tsx
git commit -m "feat(ens): add ENS text record write functionality"
```

---

## Checkpoint Summary

After completing all tasks:

1. **Contracts**: YieldHook + YieldRouter deployed to Base Sepolia
2. **ENS**: Read/write `yieldroute.vault` text records
3. **Routing**: LI.FI destination calls to YieldRouter
4. **UI**: Payment page at `/pay/[ens]` + Config page at `/app`

**Test end-to-end:**
1. Set up ENS name with vault preference
2. Pay from another chain to the ENS name
3. Verify funds arrive in vault

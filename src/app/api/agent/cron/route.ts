/**
 * AI Agent Cron Endpoint
 *
 * Called periodically (e.g., every hour via Vercel Cron)
 * - Monitors all registered receivers' gas tanks
 * - Auto-refills low tanks from cheapest chain
 * - Executes due subscriptions
 */

import { NextResponse } from 'next/server'
import { createPublicClient, http, formatEther, parseEther, type Address } from 'viem'
import { base, mainnet, arbitrum, optimism } from 'viem/chains'

// GasTankRegistry on Base
const GAS_TANK_REGISTRY = '0xB3ce7C226BF75B470B916C2385bB5FF714c3D757' as Address

const GAS_TANK_ABI = [
  {
    name: 'gasTanks',
    type: 'function',
    inputs: [{ name: 'receiver', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

// Thresholds
const LOW_TANK_THRESHOLD = parseEther('0.001') // ~20 payments
const REFILL_AMOUNT = parseEther('0.005') // ~100 payments

// Create clients
const clients = {
  base: createPublicClient({ chain: base, transport: http() }),
  mainnet: createPublicClient({ chain: mainnet, transport: http() }),
  arbitrum: createPublicClient({ chain: arbitrum, transport: http() }),
  optimism: createPublicClient({ chain: optimism, transport: http() }),
}

// In production, this would be a database
// For hackathon, we use in-memory + localStorage simulation
const MONITORED_RECEIVERS: Address[] = []

type AgentAction = {
  type: 'tank_check' | 'tank_low' | 'refill_initiated' | 'subscription_executed' | 'error'
  receiver: string
  details: Record<string, unknown>
  timestamp: string
}

const agentLog: AgentAction[] = []

function log(action: Omit<AgentAction, 'timestamp'>) {
  const entry = { ...action, timestamp: new Date().toISOString() }
  agentLog.push(entry)
  // Keep last 100 actions
  if (agentLog.length > 100) agentLog.shift()
  console.log(`[AI Agent] ${action.type}:`, action.details)
}

async function checkTankBalance(receiver: Address): Promise<bigint> {
  try {
    const balance = await clients.base.readContract({
      address: GAS_TANK_REGISTRY,
      abi: GAS_TANK_ABI,
      functionName: 'gasTanks',
      args: [receiver],
    })
    return balance as bigint
  } catch {
    return BigInt(0)
  }
}

async function getMultichainBalances(receiver: Address) {
  const balances = await Promise.all(
    Object.entries(clients).map(async ([chainName, client]) => {
      try {
        const balance = await client.getBalance({ address: receiver })
        return { chain: chainName, balance }
      } catch {
        return { chain: chainName, balance: BigInt(0) }
      }
    })
  )
  return balances.sort((a, b) => (b.balance > a.balance ? 1 : -1))
}

async function findCheapestRefillSource(receiver: Address) {
  const balances = await getMultichainBalances(receiver)
  const minBalance = REFILL_AMOUNT + parseEther('0.001') // Need refill amount + gas

  // Find chains with sufficient balance (excluding Base since that's destination)
  const eligible = balances.filter(
    b => b.balance >= minBalance && b.chain !== 'base'
  )

  if (eligible.length === 0) return null

  // Return cheapest (for now, just first eligible - in production, compare bridge costs)
  return eligible[0]
}

async function processReceiver(receiver: Address) {
  const tankBalance = await checkTankBalance(receiver)

  log({
    type: 'tank_check',
    receiver,
    details: { balance: formatEther(tankBalance) },
  })

  if (tankBalance < LOW_TANK_THRESHOLD) {
    log({
      type: 'tank_low',
      receiver,
      details: {
        balance: formatEther(tankBalance),
        threshold: formatEther(LOW_TANK_THRESHOLD),
      },
    })

    // Find refill source
    const source = await findCheapestRefillSource(receiver)

    if (source) {
      log({
        type: 'refill_initiated',
        receiver,
        details: {
          fromChain: source.chain,
          fromBalance: formatEther(source.balance),
          refillAmount: formatEther(REFILL_AMOUNT),
        },
      })

      // In production, this would call LI.FI to bridge funds
      // For hackathon, we just log the intent
      return {
        action: 'refill',
        source: source.chain,
        amount: formatEther(REFILL_AMOUNT),
      }
    } else {
      log({
        type: 'error',
        receiver,
        details: { error: 'No funds available on other chains for refill' },
      })
      return { action: 'alert', reason: 'no_funds' }
    }
  }

  return { action: 'none', balance: formatEther(tankBalance) }
}

// Subscription types
type Subscription = {
  id: string
  payer: Address
  receiver: Address
  amount: string
  token: Address
  frequency: 'weekly' | 'monthly'
  nextDue: string
  active: boolean
}

// In production, this would be a database
const subscriptions: Subscription[] = []

async function processDueSubscriptions() {
  const now = new Date()
  const dueSubscriptions = subscriptions.filter(
    s => s.active && new Date(s.nextDue) <= now
  )

  const results = []
  for (const sub of dueSubscriptions) {
    try {
      // In production, this would execute the payment via Permit2
      log({
        type: 'subscription_executed',
        receiver: sub.receiver,
        details: {
          subscriptionId: sub.id,
          payer: sub.payer,
          amount: sub.amount,
          frequency: sub.frequency,
        },
      })

      // Update next due date
      const nextDue = new Date(sub.nextDue)
      if (sub.frequency === 'weekly') {
        nextDue.setDate(nextDue.getDate() + 7)
      } else {
        nextDue.setMonth(nextDue.getMonth() + 1)
      }
      sub.nextDue = nextDue.toISOString()

      results.push({ subscriptionId: sub.id, status: 'executed' })
    } catch (error) {
      log({
        type: 'error',
        receiver: sub.receiver,
        details: { subscriptionId: sub.id, error: String(error) },
      })
      results.push({ subscriptionId: sub.id, status: 'failed' })
    }
  }

  return results
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  // Return agent log
  if (action === 'log') {
    return NextResponse.json({
      log: agentLog.slice(-20),
      monitoredReceivers: MONITORED_RECEIVERS.length,
      activeSubscriptions: subscriptions.filter(s => s.active).length,
    })
  }

  // Return subscription status
  if (action === 'subscriptions') {
    const receiver = searchParams.get('receiver')
    if (receiver) {
      const receiverSubs = subscriptions.filter(
        s => s.receiver.toLowerCase() === receiver.toLowerCase()
      )
      return NextResponse.json({ subscriptions: receiverSubs })
    }
    return NextResponse.json({ subscriptions })
  }

  // Run the agent cycle (called by cron)
  const results = {
    timestamp: new Date().toISOString(),
    tankChecks: [] as { receiver: string; result: unknown }[],
    subscriptions: [] as { subscriptionId: string; status: string }[],
  }

  // Check all monitored receivers
  for (const receiver of MONITORED_RECEIVERS) {
    const result = await processReceiver(receiver)
    results.tankChecks.push({ receiver, result })
  }

  // Process due subscriptions
  results.subscriptions = await processDueSubscriptions()

  return NextResponse.json({
    success: true,
    agentRun: results,
    nextRun: 'in 1 hour',
  })
}

export async function POST(request: Request) {
  const body = await request.json()
  const { action } = body

  // Register a receiver for monitoring
  if (action === 'register') {
    const { receiver } = body
    if (receiver && !MONITORED_RECEIVERS.includes(receiver)) {
      MONITORED_RECEIVERS.push(receiver)
      log({
        type: 'tank_check',
        receiver,
        details: { action: 'registered for monitoring' },
      })
    }
    return NextResponse.json({ success: true, monitored: MONITORED_RECEIVERS.length })
  }

  // Create a subscription
  if (action === 'createSubscription') {
    const { payer, receiver, amount, token, frequency } = body

    const nextDue = new Date()
    if (frequency === 'weekly') {
      nextDue.setDate(nextDue.getDate() + 7)
    } else {
      nextDue.setMonth(nextDue.getMonth() + 1)
    }

    const subscription: Subscription = {
      id: `sub_${Date.now()}`,
      payer,
      receiver,
      amount,
      token,
      frequency,
      nextDue: nextDue.toISOString(),
      active: true,
    }

    subscriptions.push(subscription)

    log({
      type: 'subscription_executed',
      receiver,
      details: { action: 'created', ...subscription },
    })

    return NextResponse.json({ success: true, subscription })
  }

  // Cancel a subscription
  if (action === 'cancelSubscription') {
    const { subscriptionId } = body
    const sub = subscriptions.find(s => s.id === subscriptionId)
    if (sub) {
      sub.active = false
      return NextResponse.json({ success: true, subscription: sub })
    }
    return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

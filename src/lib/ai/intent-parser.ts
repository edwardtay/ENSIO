/**
 * AI-powered intent parser using Groq LLM
 * Converts natural language into structured payment intents
 */

export interface PaymentIntent {
  action: 'pay' | 'swap' | 'bridge' | 'subscribe' | 'refill'
  recipient?: string // ENS name or address
  amount?: string
  token?: string
  fromChain?: string
  toChain?: string
  frequency?: 'once' | 'weekly' | 'monthly'
  strategy?: 'yield' | 'restaking' | 'liquid'
  confidence: number
  reasoning: string
}

export interface AgentDecision {
  shouldAct: boolean
  action?: PaymentIntent
  reasoning: string
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

const SYSTEM_PROMPT = `You are FlowFi's AI payment agent. You analyze situations and decide on actions.

Available actions:
- pay: Send payment to an ENS name or address
- swap: Exchange one token for another
- bridge: Move tokens across chains
- subscribe: Set up recurring payment
- refill: Top up a gas tank for gasless payments

Supported chains: ethereum, base, arbitrum, optimism, polygon
Supported tokens: USDC, USDT, ETH, WETH, DAI
Strategies: yield (earn interest), restaking (earn points), liquid (keep cash)

Always respond with valid JSON matching this schema:
{
  "action": "pay|swap|bridge|subscribe|refill",
  "recipient": "name.eth or 0x address (if applicable)",
  "amount": "numeric string",
  "token": "token symbol",
  "fromChain": "chain name",
  "toChain": "chain name",
  "frequency": "once|weekly|monthly",
  "strategy": "yield|restaking|liquid",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`

const DECISION_PROMPT = `You are FlowFi's autonomous agent. Analyze the situation and decide whether to act.

Context:
- You manage gas tanks for receivers (so their payers don't pay gas)
- You can execute swaps, bridges, and payments
- You should act when: gas tanks are low, scheduled payments are due, or yield opportunities exist
- You should NOT act when: balances are healthy, no pending tasks, or action would be wasteful

Respond with JSON:
{
  "shouldAct": true/false,
  "action": { ...PaymentIntent if shouldAct },
  "reasoning": "why you decided this"
}`

async function callGroq(messages: { role: string; content: string }[]): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured')
  }

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Groq API error: ${error}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || '{}'
}

/**
 * Parse natural language into a structured payment intent
 */
export async function parseIntent(userMessage: string): Promise<PaymentIntent> {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ]

  const response = await callGroq(messages)

  try {
    const parsed = JSON.parse(response)
    return {
      action: parsed.action || 'pay',
      recipient: parsed.recipient,
      amount: parsed.amount,
      token: parsed.token || 'USDC',
      fromChain: parsed.fromChain || 'base',
      toChain: parsed.toChain || 'base',
      frequency: parsed.frequency || 'once',
      strategy: parsed.strategy,
      confidence: parsed.confidence || 0.5,
      reasoning: parsed.reasoning || 'Parsed from user input',
    }
  } catch {
    return {
      action: 'pay',
      confidence: 0,
      reasoning: 'Failed to parse intent',
    }
  }
}

/**
 * Autonomous agent decision-making
 * Given a situation, decide whether and how to act
 */
export async function makeDecision(situation: {
  gasTanks: { receiver: string; balance: string; threshold: string }[]
  pendingPayments: { to: string; amount: string; dueAt: string }[]
  marketConditions?: { gasPrice: string; ethPrice: string }
}): Promise<AgentDecision> {
  const situationText = `
Current situation:
- Gas tanks: ${JSON.stringify(situation.gasTanks)}
- Pending payments: ${JSON.stringify(situation.pendingPayments)}
- Market: ${JSON.stringify(situation.marketConditions || { gasPrice: 'normal', ethPrice: 'stable' })}

Should I take any action?`

  const messages = [
    { role: 'system', content: DECISION_PROMPT },
    { role: 'user', content: situationText },
  ]

  const response = await callGroq(messages)

  try {
    const parsed = JSON.parse(response)
    return {
      shouldAct: parsed.shouldAct || false,
      action: parsed.action,
      reasoning: parsed.reasoning || 'No reasoning provided',
    }
  } catch {
    return {
      shouldAct: false,
      reasoning: 'Failed to parse decision',
    }
  }
}

/**
 * Generate a human-readable summary of an action
 */
export async function explainAction(intent: PaymentIntent): Promise<string> {
  const messages = [
    {
      role: 'system',
      content: 'You are a helpful assistant. Explain blockchain actions in simple terms. Keep it under 50 words.'
    },
    {
      role: 'user',
      content: `Explain this action: ${JSON.stringify(intent)}`
    },
  ]

  const response = await callGroq(messages)

  try {
    const parsed = JSON.parse(response)
    return parsed.explanation || response
  } catch {
    return response
  }
}

import Groq from 'groq-sdk'
import { type ParsedIntent } from '@/lib/types'

const client = new Groq({ apiKey: process.env.GROQ_API_KEY })

const SYSTEM_PROMPT = `You are PayAgent, an AI payment agent that parses natural language into stablecoin transaction intents.

Given a user message, extract the intent as JSON:

{
  "action": "transfer" | "swap" | "deposit" | "yield" | "pay_x402" | "consolidate",
  "amount": string (numeric value only),
  "fromToken": string (e.g. "USDC", "USDT", "DAI", "FRAX", "LUSD", "GHO", "ETH", "WETH", "cbBTC", "WBTC"),
  "toToken": string,
  "toAddress": string | null (ENS name or 0x address),
  "toChain": string | null (e.g. "arbitrum", "base", "ethereum", "optimism"),
  "fromChain": string | null (null means auto-detect from wallet),
  "url": string | null (only for x402 actions),
  "vaultProtocol": string | null (e.g. "aave", "morpho" — only for deposit/yield actions)
}

Rules:
- If user says "send" or "transfer", action is "transfer"
- If user says "swap" or "convert" or "exchange", action is "swap"
- If user says "deposit", "supply", "lend", or "stake into vault", action is "deposit"
- If user says "yield", "earn", "farm", or "best rate", action is "yield"
- If user mentions a URL or "access" or "pay for", action is "pay_x402"
- If user says "consolidate", "sweep", "auto-convert", "move everything to", or "consolidate my tokens", action is "consolidate"
- If user says "set my preferred store of value to X", action is "consolidate" with toToken set to X
- For deposit/yield: if user mentions "aave" or "aToken", set vaultProtocol to "aave"
- For deposit/yield: if user mentions "morpho", set vaultProtocol to "morpho"
- For deposit/yield: toToken can be null (vault token is resolved automatically)
- If no toToken specified on transfer, assume same as fromToken
- If no fromToken specified, assume "USDC"
- Normalize token names: "cbbtc" or "cbBtc" → "cbBTC", "eth" or "ether" → "ETH", "wbtc" → "WBTC", "weth" → "WETH"
- If user wants to swap from one token to a different token (e.g. "50 USDC to cbBTC"), action is "swap"
- Respond ONLY with valid JSON. No markdown fences, no explanation.`

export async function parseIntent(userMessage: string): Promise<ParsedIntent> {
  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    max_tokens: 256,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    temperature: 0,
  })

  const text = response.choices[0]?.message?.content ?? ''
  return JSON.parse(text)
}

/**
 * Gelato Relay Integration for Gasless Payments
 *
 * Flow:
 * 1. User signs a permit (off-chain, no gas)
 * 2. Gelato's relayer network executes the transaction
 * 3. Fee is deducted from the transferred tokens (~0.5-1%)
 *
 * User pays: $0 gas
 * Gelato handles: Execution, gas payment, reimbursement
 */

import { GelatoRelay, CallWithSyncFeeRequest } from '@gelatonetwork/relay-sdk'
import { encodeFunctionData, type Address } from 'viem'

// Gelato Relay instance (no API key needed for syncFee mode)
const relay = new GelatoRelay()

// Contract addresses
const PERMIT2_ADDRESS = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

// Base chain ID
const BASE_CHAIN_ID = BigInt(8453)

// FlowFi Gasless Payment Router (to be deployed)
// This contract will:
// 1. Receive permit signature
// 2. Call Permit2.permitTransferFrom
// 3. Deposit to vault
// 4. Transfer receipt to recipient
export const GASLESS_ROUTER_ADDRESS = '0x38CD83c6E690526770962A7A912D1CCAF6070EA4' as Address

/**
 * ABI for the GaslessPaymentRouter contract
 */
const GASLESS_ROUTER_ABI = [
  {
    name: 'executePayment',
    type: 'function',
    inputs: [
      { name: 'permit', type: 'tuple', components: [
        { name: 'permitted', type: 'tuple', components: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ]},
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ]},
      { name: 'owner', type: 'address' },
      { name: 'signature', type: 'bytes' },
      { name: 'recipient', type: 'address' },
      { name: 'vault', type: 'address' },
      { name: 'maxFee', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'executeSimplePayment',
    type: 'function',
    inputs: [
      { name: 'permit', type: 'tuple', components: [
        { name: 'permitted', type: 'tuple', components: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ]},
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ]},
      { name: 'owner', type: 'address' },
      { name: 'signature', type: 'bytes' },
      { name: 'recipient', type: 'address' },
      { name: 'maxFee', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

/**
 * Permit2 typed data for signing
 */
export const PERMIT2_DOMAIN = {
  name: 'Permit2',
  chainId: Number(BASE_CHAIN_ID),
  verifyingContract: PERMIT2_ADDRESS,
} as const

export const PERMIT_TRANSFER_FROM_TYPES = {
  PermitTransferFrom: [
    { name: 'permitted', type: 'TokenPermissions' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  TokenPermissions: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
} as const

export interface GaslessPaymentParams {
  /** Payer's address (signer) */
  payer: Address
  /** Recipient's address or vault */
  recipient: Address
  /** Amount in token decimals (e.g., 1000000 for 1 USDC) */
  amount: bigint
  /** Token address (default: USDC on Base) */
  token?: Address
  /** Vault address for auto-deposit (optional) */
  vault?: Address
  /** Deadline timestamp (default: 30 minutes from now) */
  deadline?: bigint
}

export interface PermitData {
  domain: typeof PERMIT2_DOMAIN
  types: typeof PERMIT_TRANSFER_FROM_TYPES
  primaryType: 'PermitTransferFrom'
  message: {
    permitted: {
      token: Address
      amount: bigint
    }
    spender: Address
    nonce: bigint
    deadline: bigint
  }
}

/**
 * Generate permit data for the user to sign
 * This is completely gasless - just a signature
 */
export async function generatePermitData(
  params: GaslessPaymentParams,
  nonce: bigint
): Promise<PermitData> {
  const token = params.token || USDC_BASE
  const deadline = params.deadline || BigInt(Math.floor(Date.now() / 1000) + 30 * 60) // 30 min

  return {
    domain: PERMIT2_DOMAIN,
    types: PERMIT_TRANSFER_FROM_TYPES,
    primaryType: 'PermitTransferFrom',
    message: {
      permitted: {
        token,
        amount: params.amount,
      },
      spender: GASLESS_ROUTER_ADDRESS,
      nonce,
      deadline,
    },
  }
}

/**
 * Execute gasless payment via Gelato Relay
 *
 * After user signs the permit, call this to submit to Gelato
 */
export async function executeGaslessPayment(
  params: GaslessPaymentParams,
  signature: `0x${string}`,
  nonce: bigint,
  maxFee?: bigint
): Promise<{ taskId: string }> {
  const token = params.token || USDC_BASE
  const deadline = params.deadline || BigInt(Math.floor(Date.now() / 1000) + 30 * 60)
  // Default max fee: 1 USDC (should be way more than enough)
  const fee = maxFee || BigInt(1000000)

  // Encode the call to our GaslessPaymentRouter
  const data = params.vault
    ? encodeFunctionData({
        abi: GASLESS_ROUTER_ABI,
        functionName: 'executePayment',
        args: [
          {
            permitted: { token, amount: params.amount },
            nonce,
            deadline,
          },
          params.payer,
          signature,
          params.recipient,
          params.vault,
          fee,
        ],
      })
    : encodeFunctionData({
        abi: GASLESS_ROUTER_ABI,
        functionName: 'executeSimplePayment',
        args: [
          {
            permitted: { token, amount: params.amount },
            nonce,
            deadline,
          },
          params.payer,
          signature,
          params.recipient,
          fee,
        ],
      })

  // Build Gelato relay request
  // Using callWithSyncFee - fee is deducted from the transferred tokens
  const request: CallWithSyncFeeRequest = {
    chainId: BASE_CHAIN_ID,
    target: GASLESS_ROUTER_ADDRESS,
    data,
    feeToken: token, // Pay fee in USDC
    isRelayContext: true, // Enable fee deduction
  }

  // Submit to Gelato's relayer network
  const response = await relay.callWithSyncFee(request)

  return { taskId: response.taskId }
}

/**
 * Check task status on Gelato
 */
export async function getTaskStatus(taskId: string) {
  const status = await relay.getTaskStatus(taskId)
  return status
}

/**
 * Estimate Gelato relay fee
 * Returns fee in token decimals
 */
export async function estimateRelayFee(
  gasLimit: bigint = BigInt(300000),
  feeToken: Address = USDC_BASE
): Promise<bigint> {
  try {
    const fee = await relay.getEstimatedFee(
      BASE_CHAIN_ID,
      feeToken,
      gasLimit,
      false // isHighPriority
    )
    return BigInt(fee.toString())
  } catch {
    // Fallback estimate: ~$0.10-0.20 on Base
    return BigInt(200000) // 0.20 USDC (6 decimals)
  }
}

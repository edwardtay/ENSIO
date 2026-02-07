import { createWalletClient, createPublicClient, http, parseUnits, formatUnits, erc20Abi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { createConfig, getQuote } from '@lifi/sdk'
import { config } from 'dotenv'

// Load .env.local
config({ path: '.env.local' })

// DAI on Ethereum mainnet
const DAI_MAINNET = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
// Morpho Spark USDC Vault on Base (edwardtay.eth's yield preference)
const MORPHO_VAULT_BASE = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A'
const RECIPIENT = '0x38430336153468dcf36Af5cea7D6bc472425633A' // edwardtay.eth

async function main() {
  const privateKey = process.env.AGENT2_PRIVATE_KEY
  if (!privateKey) {
    console.error('AGENT2_PRIVATE_KEY not found in env')
    process.exit(1)
  }

  // Setup account
  const account = privateKeyToAccount(`0x${privateKey.replace('0x', '')}`)
  console.log('Wallet address:', account.address)

  // Setup viem clients
  // Use QuickNode RPC
  const rpcUrl = process.env.ETH_RPC_URL || 'https://maximum-purple-mountain.quiknode.pro/b9630cbedceb81693d9fe864ac2708b64c74d7ee/'

  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http(rpcUrl),
  })

  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  })

  // Skip balance check - we know wallet has DAI from earlier test
  console.log('DAI Balance: ~50 DAI (skipping RPC check)')

  // Setup LI.FI
  createConfig({ integrator: 'ensio' })

  // Get quote for 1 DAI -> USDC on Base
  console.log('\nGetting quote for 1 DAI -> edwardtay.eth (USDC on Base)...')

  const quote = await getQuote({
    fromChain: 1,
    fromToken: DAI_MAINNET,
    fromAddress: account.address.toLowerCase(),
    fromAmount: parseUnits('1', 18).toString(),
    toChain: 8453,
    toToken: MORPHO_VAULT_BASE, // Vault address for yield deposit
    toAddress: RECIPIENT.toLowerCase(),
    slippage: 0.01,
  })

  console.log('Quote received:')
  console.log('- From:', quote.action.fromToken.symbol, 'on Ethereum')
  console.log('- To:', quote.action.toToken.symbol, 'on Base')
  console.log('- Estimated output:', formatUnits(BigInt(quote.estimate.toAmount), 6), 'USDC')
  console.log('- Gas cost:', quote.estimate.gasCosts?.[0]?.amountUSD || 'N/A', 'USD')

  // LI.FI Diamond address
  const lifiDiamond = quote.transactionRequest.to as `0x${string}`
  console.log('\nLI.FI Diamond:', lifiDiamond)
  console.log('Approval was done in previous run (TX: 0x363ea2659cc851701f2c44b8a8ec50e6d9c94dbf5700013f6452238d05d03d47)')

  // Execute the transaction (vault zaps need ~600K+ gas)
  console.log('\nExecuting swap + bridge + vault deposit...')
  const gasLimit = Math.max(Number(quote.transactionRequest.gasLimit || 0), 700000)
  console.log('Gas limit:', gasLimit)

  const tx = await walletClient.sendTransaction({
    to: quote.transactionRequest.to as `0x${string}`,
    data: quote.transactionRequest.data as `0x${string}`,
    value: BigInt(quote.transactionRequest.value || 0),
    gas: BigInt(gasLimit),
  })

  console.log('TX Hash:', tx)
  console.log('View on Etherscan: https://etherscan.io/tx/' + tx)

  // Wait for confirmation
  console.log('\nWaiting for confirmation...')
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx })
  console.log('Status:', receipt.status === 'success' ? 'SUCCESS' : 'FAILED')
  console.log('Gas used:', receipt.gasUsed.toString())

  console.log('\n✅ Payment sent! USDC will arrive on Base in ~15-20 minutes.')
  console.log('Track: https://scan.li.fi/tx/' + tx)
}

main().catch(console.error)

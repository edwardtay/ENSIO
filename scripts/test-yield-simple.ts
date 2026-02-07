import { createWalletClient, createPublicClient, http, parseUnits, formatUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { createConfig, getQuote } from '@lifi/sdk'
import { config } from 'dotenv'

config({ path: '.env.local' })

// Simple approach: Use vault address as toToken
// LI.FI handles the vault deposit internally
const DAI_MAINNET = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
const MORPHO_VAULT = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A'
const RECIPIENT = '0x38430336153468dcf36Af5cea7D6bc472425633A'

async function main() {
  const pk = process.env.AGENT2_PRIVATE_KEY
  if (!pk) { console.error('No key'); process.exit(1) }

  const account = privateKeyToAccount(`0x${pk.replace('0x', '')}`)
  console.log('From:', account.address)
  console.log('To:', RECIPIENT, '(edwardtay.eth)')
  console.log('Strategy: yield → Morpho Vault')

  // Use Flashbots for MEV protection
  const flashbotsRpc = 'https://rpc.flashbots.net'
  const publicRpc = 'https://cloudflare-eth.com'

  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http(flashbotsRpc),
  })

  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(publicRpc),
  })

  createConfig({ integrator: 'ensio' })

  console.log('\nGetting quote: 1 DAI → Morpho Vault shares...')

  // Use vault as toToken - LI.FI does native vault zap
  const quote = await getQuote({
    fromChain: 1,
    fromToken: DAI_MAINNET,
    fromAddress: account.address.toLowerCase(),
    fromAmount: parseUnits('1', 18).toString(),
    toChain: 8453,
    toToken: MORPHO_VAULT, // Vault = auto-deposit
    toAddress: RECIPIENT.toLowerCase(),
    slippage: 0.01,
  })

  console.log('Quote:')
  console.log('- From:', quote.action.fromToken.symbol)
  console.log('- To:', quote.action.toToken.symbol, '(vault shares)')
  console.log('- Est. shares:', formatUnits(BigInt(quote.estimate.toAmount), 18))

  const gasLimit = Math.max(Number(quote.transactionRequest?.gasLimit || 0), 1500000)
  console.log('- Gas limit:', gasLimit)

  console.log('\n🛡️ Sending via Flashbots Protect...')

  const tx = await walletClient.sendTransaction({
    to: quote.transactionRequest!.to as `0x${string}`,
    data: quote.transactionRequest!.data as `0x${string}`,
    value: BigInt(quote.transactionRequest!.value || 0),
    gas: BigInt(gasLimit),
  })

  console.log('TX:', tx)
  console.log('https://etherscan.io/tx/' + tx)

  console.log('\nWaiting for confirmation...')
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx, timeout: 180_000 })
  console.log('Status:', receipt.status === 'success' ? '✅ SUCCESS' : '❌ FAILED')

  console.log('\nTrack: https://scan.li.fi/tx/' + tx)
}

main().catch(e => console.error('Error:', e.message))

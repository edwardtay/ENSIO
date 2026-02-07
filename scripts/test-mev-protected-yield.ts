import { createWalletClient, createPublicClient, http, parseUnits, formatUnits, encodeFunctionData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { config } from 'dotenv'

config({ path: '.env.local' })

// Addresses
const DAI_MAINNET = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const MORPHO_VAULT = '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A' // edwardtay.eth's yield vault
const MEV_PROTECTED_ROUTER = '0x0B880127FFb09727468159f3883c76Fd1B1c59A2'
const RECIPIENT = '0x38430336153468dcf36Af5cea7D6bc472425633A' // edwardtay.eth

// LI.FI API
const LIFI_API = 'https://li.quest/v1'

async function main() {
  const privateKey = process.env.AGENT2_PRIVATE_KEY
  if (!privateKey) {
    console.error('AGENT2_PRIVATE_KEY not found')
    process.exit(1)
  }

  const account = privateKeyToAccount(`0x${privateKey.replace('0x', '')}`)
  console.log('From:', account.address)
  console.log('To:', RECIPIENT, '(edwardtay.eth)')
  console.log('Vault:', MORPHO_VAULT, '(Morpho Spark USDC)')
  console.log('MEV Router:', MEV_PROTECTED_ROUTER)

  // Use Flashbots Protect RPC for MEV protection on source chain
  const flashbotsRpc = 'https://rpc.flashbots.net'
  const publicRpc = 'https://eth.llamarpc.com' // For reads

  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http(flashbotsRpc), // MEV-protected submission
  })

  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(publicRpc),
  })

  const amountWei = parseUnits('1', 18) // 1 DAI

  // Calculate minShares with 1% slippage (conservative)
  // For USDC vaults, shares ≈ assets * 10^12 (6 decimals → 18 decimals)
  const expectedUSDC = parseUnits('0.99', 6) // ~$0.99 after fees
  const expectedShares = expectedUSDC * BigInt(10 ** 12)
  const minShares = expectedShares - (expectedShares * BigInt(100)) / BigInt(10000) // 1% slippage

  console.log('\nExpected shares:', formatUnits(expectedShares, 18))
  console.log('Min shares (1% slippage):', formatUnits(minShares, 18))

  // Encode lifiCallback(vault, recipient, minShares)
  const callData = encodeFunctionData({
    abi: [{
      name: 'lifiCallback',
      type: 'function',
      inputs: [
        { name: 'vault', type: 'address' },
        { name: 'recipient', type: 'address' },
        { name: 'minShares', type: 'uint256' },
      ],
      outputs: [{ name: 'shares', type: 'uint256' }],
    }],
    functionName: 'lifiCallback',
    args: [MORPHO_VAULT, RECIPIENT, minShares],
  })

  console.log('\nGetting LI.FI Contract Calls quote...')

  // LI.FI Contract Calls: Bridge DAI → USDC, then call MEVProtectedVaultRouter
  const quoteRes = await fetch(`${LIFI_API}/quote/contractCalls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromChain: 1, // Ethereum
      fromToken: DAI_MAINNET,
      fromAddress: account.address.toLowerCase(),
      fromAmount: amountWei.toString(),
      toChain: 8453, // Base
      toToken: USDC_BASE,
      contractCalls: [
        {
          fromAmount: parseUnits('0.98', 6).toString(), // Expected USDC after bridge (~$0.98)
          fromTokenAddress: USDC_BASE,
          toContractAddress: MEV_PROTECTED_ROUTER,
          toContractCallData: callData,
          toContractGasLimit: '350000',
        },
      ],
      slippage: 0.01,
      denyExchanges: ['nordstern'],
      integrator: 'ensio',
    }),
  })

  const quote = await quoteRes.json()

  if (quote.message || quote.error) {
    console.error('Quote error:', quote.message || quote.error)
    process.exit(1)
  }

  console.log('Quote received:')
  console.log('- From:', quote.action?.fromToken?.symbol || 'DAI', 'on Ethereum')
  console.log('- To: USDC → MEVProtectedVaultRouter → Morpho Vault')
  console.log('- Estimated USDC:', formatUnits(BigInt(quote.estimate?.toAmount || 0), 6))
  console.log('- Gas cost:', quote.estimate?.gasCosts?.[0]?.amountUSD || 'N/A', 'USD')

  const txRequest = quote.transactionRequest
  if (!txRequest) {
    console.error('No transaction request in quote')
    process.exit(1)
  }

  console.log('\nLI.FI Diamond:', txRequest.to)
  console.log('Gas limit:', txRequest.gasLimit || 'auto')

  // Execute via Flashbots (MEV-protected)
  console.log('\n🛡️  Sending TX via Flashbots Protect (MEV-protected)...')

  const gasLimit = Math.max(Number(txRequest.gasLimit || 0), 1500000)

  const tx = await walletClient.sendTransaction({
    to: txRequest.to as `0x${string}`,
    data: txRequest.data as `0x${string}`,
    value: BigInt(txRequest.value || 0),
    gas: BigInt(gasLimit),
  })

  console.log('TX Hash:', tx)
  console.log('Etherscan: https://etherscan.io/tx/' + tx)

  // Wait for confirmation
  console.log('\nWaiting for confirmation...')
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: tx,
    timeout: 180_000, // 3 minutes
  })

  console.log('Status:', receipt.status === 'success' ? '✅ SUCCESS' : '❌ FAILED')
  console.log('Gas used:', receipt.gasUsed.toString())

  if (receipt.status === 'success') {
    console.log('\n✅ MEV-protected yield deposit initiated!')
    console.log('Track bridge: https://scan.li.fi/tx/' + tx)
    console.log('\nShares will arrive in Morpho vault for', RECIPIENT)
  } else {
    console.log('\n❌ Transaction failed - check Etherscan for details')
  }
}

main().catch(console.error)

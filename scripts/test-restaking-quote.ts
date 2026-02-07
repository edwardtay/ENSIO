import { getQuote } from '@lifi/sdk'
import { getAddress } from 'viem'

async function testRestakingQuote() {
  const recipient = getAddress('0x3843C8727B6B6C42A57164C51a501200c2e2633A') // edwardtay.eth
  const restakingRouter = getAddress('0x31549dB00B180d528f77083b130C0A045D0CF117')
  
  console.log('Testing restaking route...')
  console.log('Recipient:', recipient)
  console.log('RestakingRouter:', restakingRouter)
  
  // Test: Simple quote - ETH on Base → WETH to RestakingRouter
  try {
    const quote = await getQuote({
      fromAddress: recipient,
      fromChain: 8453, // Base
      fromToken: '0x0000000000000000000000000000000000000000', // ETH
      fromAmount: '1000000000000000', // 0.001 ETH
      toChain: 8453,
      toToken: '0x4200000000000000000000000000000000000006', // WETH
      toAddress: restakingRouter,
      slippage: 0.01,
    })
    
    console.log('\n✅ Quote successful!')
    console.log('From:', quote.action.fromToken.symbol, 'on', quote.action.fromChainId)
    console.log('To:', quote.action.toToken.symbol, 'on', quote.action.toChainId)
    console.log('Estimated output:', quote.estimate.toAmount)
    console.log('Gas cost:', quote.estimate.gasCosts?.[0]?.amountUSD || 'N/A')
    
    // The transaction data
    console.log('\nTransaction:')
    console.log('To:', quote.transactionRequest?.to)
    console.log('Value:', quote.transactionRequest?.value)
    console.log('Data length:', quote.transactionRequest?.data?.length)
  } catch (error: unknown) {
    console.error('Quote failed:', error instanceof Error ? error.message : error)
  }
}

testRestakingQuote()

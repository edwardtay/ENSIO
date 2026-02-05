import { createPublicClient, encodeFunctionData, http, namehash } from 'viem'
import { normalize } from 'viem/ens'
import { mainnet } from 'viem/chains'

const client = createPublicClient({
  chain: mainnet,
  transport: http(process.env.ETH_RPC_URL || 'https://eth.llamarpc.com'),
})

const resolverAbi = [
  {
    name: 'setText',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
    outputs: [],
  },
  {
    name: 'multicall',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'data', type: 'bytes[]' }],
    outputs: [{ name: 'results', type: 'bytes[]' }],
  },
] as const

/**
 * Build transaction data that writes com.payagent.token and com.payagent.chain
 * text records on the user's ENS resolver via a single multicall.
 */
export async function buildSetPreferenceTransaction(
  ensName: string,
  token: string,
  chain: string,
): Promise<{ to: string; data: string; value: string; chainId: number }> {
  const normalized = normalize(ensName)
  const node = namehash(normalized)

  const resolverAddress = await client.getEnsResolver({ name: normalized })
  if (!resolverAddress) {
    throw new Error(`No resolver found for ${ensName}`)
  }

  const setTokenData = encodeFunctionData({
    abi: resolverAbi,
    functionName: 'setText',
    args: [node, 'com.payagent.token', token],
  })

  const setChainData = encodeFunctionData({
    abi: resolverAbi,
    functionName: 'setText',
    args: [node, 'com.payagent.chain', chain],
  })

  const data = encodeFunctionData({
    abi: resolverAbi,
    functionName: 'multicall',
    args: [[setTokenData, setChainData]],
  })

  return {
    to: resolverAddress,
    data,
    value: '0',
    chainId: 1,
  }
}

/**
 * Build transaction data that writes yieldroute.vault text record
 * on the user's ENS resolver.
 */
export async function buildSetYieldVaultTransaction(
  ensName: string,
  vaultAddress: string,
): Promise<{ to: string; data: string; value: string; chainId: number }> {
  const normalized = normalize(ensName)
  const node = namehash(normalized)

  const resolverAddress = await client.getEnsResolver({ name: normalized })
  if (!resolverAddress) {
    throw new Error(`No resolver found for ${ensName}`)
  }

  const data = encodeFunctionData({
    abi: resolverAbi,
    functionName: 'setText',
    args: [node, 'yieldroute.vault', vaultAddress],
  })

  return {
    to: resolverAddress,
    data,
    value: '0',
    chainId: 1,
  }
}

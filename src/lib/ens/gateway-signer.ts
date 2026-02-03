/**
 * Server-side CCIP-Read gateway response signer.
 *
 * Signs gateway responses so that PayAgentResolver.resolveWithProof can
 * verify on-chain that the data came from the trusted gateway.
 *
 * Signing scheme follows EIP-3668 conventions:
 *   keccak256(abi.encodePacked(0x1900, sender, expires, keccak256(extraData), keccak256(result)))
 */

import {
  keccak256,
  encodePacked,
  type Hex,
  createWalletClient,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'

function getSignerAccount() {
  const key = process.env.GATEWAY_SIGNER_KEY
  if (!key) {
    throw new Error('GATEWAY_SIGNER_KEY environment variable is not set')
  }
  return privateKeyToAccount(key as `0x${string}`)
}

export async function signGatewayResponse(
  sender: Hex,
  expires: bigint,
  extraData: Hex,
  result: Hex,
): Promise<Hex> {
  const account = getSignerAccount()

  const messageHash = keccak256(
    encodePacked(
      ['bytes2', 'address', 'uint64', 'bytes32', 'bytes32'],
      [
        '0x1900',
        sender,
        expires,
        keccak256(extraData),
        keccak256(result),
      ],
    ),
  )

  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http(),
  })

  const signature = await walletClient.signMessage({
    message: { raw: messageHash },
  })

  return signature
}

export function getSignerAddress(): Hex {
  const account = getSignerAccount()
  return account.address
}

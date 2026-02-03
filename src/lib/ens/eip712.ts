/**
 * EIP-712 typed data definitions for offchain ENS preference signing.
 *
 * Users sign a SetPreference message (free, no gas) to store their
 * preferred token + chain offchain, served via CCIP-Read to external
 * ENS consumers.
 */

export const PREFERENCE_DOMAIN = {
  name: 'PayAgent',
  version: '1',
  chainId: 1,
} as const

export const PREFERENCE_TYPES = {
  SetPreference: [
    { name: 'ensName', type: 'string' },
    { name: 'token', type: 'string' },
    { name: 'chain', type: 'string' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

export function buildPreferenceMessage(
  ensName: string,
  token: string,
  chain: string,
  nonce: bigint,
) {
  return {
    ensName,
    token,
    chain,
    nonce,
  }
}

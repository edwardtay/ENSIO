import { NextRequest, NextResponse } from 'next/server'
import { verifyTypedData, createPublicClient, http } from 'viem'
import { normalize } from 'viem/ens'
import { mainnet } from 'viem/chains'
import { PREFERENCE_DOMAIN, PREFERENCE_TYPES, buildPreferenceMessage } from '@/lib/ens/eip712'
import { setPreference, getNonce } from '@/lib/ens/store'

const client = createPublicClient({
  chain: mainnet,
  transport: http(process.env.ETH_RPC_URL || 'https://eth.llamarpc.com'),
})

/**
 * POST /api/ens/preferences
 *
 * Accepts an EIP-712 signature proving the ENS name owner wants to set
 * their preferred token + chain. Verifies ownership and stores offchain.
 */
export async function POST(req: NextRequest) {
  try {
    const { ensName, token, chain, nonce, signature, signerAddress } = await req.json()

    if (!ensName || !token || !chain || !signature || !signerAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: ensName, token, chain, signature, signerAddress' },
        { status: 400 },
      )
    }

    // Verify the EIP-712 signature
    const message = buildPreferenceMessage(ensName, token, chain, BigInt(nonce))
    const isValid = await verifyTypedData({
      address: signerAddress as `0x${string}`,
      domain: PREFERENCE_DOMAIN,
      types: PREFERENCE_TYPES,
      primaryType: 'SetPreference',
      message,
      signature: signature as `0x${string}`,
    })

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Verify the signer owns the ENS name
    const normalized = normalize(ensName)
    const resolvedAddress = await client.getEnsAddress({ name: normalized })

    if (
      !resolvedAddress ||
      resolvedAddress.toLowerCase() !== signerAddress.toLowerCase()
    ) {
      return NextResponse.json(
        { error: 'Signer does not own this ENS name' },
        { status: 403 },
      )
    }

    // Store the preference
    await setPreference(ensName, token, chain, signerAddress, signature)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('ENS preferences API error:', error)
    const message = error instanceof Error ? error.message : 'Failed to set preference'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/ens/preferences?name=foo.eth
 *
 * Returns the current nonce for signing a new preference.
 */
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')
  if (!name) {
    return NextResponse.json({ error: 'Missing name parameter' }, { status: 400 })
  }
  const nonce = await getNonce(name)
  return NextResponse.json({ nonce: nonce.toString() })
}

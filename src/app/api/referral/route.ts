import { NextRequest, NextResponse } from 'next/server'
import {
  registerReferral,
  getReferrerStats,
  generateReferralCode,
  decodeReferralCode,
  calculateReferralReward,
  REFERRAL_FEE_SHARE,
  REFERRAL_DURATION_MS,
} from '@/lib/incentives/referrals'

/**
 * GET /api/referral?address=vitalik.eth
 * Get referral stats for an address
 *
 * GET /api/referral?code=abc123
 * Decode a referral code to get referrer
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  const code = req.nextUrl.searchParams.get('code')

  // Decode referral code
  if (code) {
    const referrer = decodeReferralCode(code)
    if (!referrer) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 })
    }
    return NextResponse.json({ referrer })
  }

  // Get referrer stats
  if (address) {
    const stats = getReferrerStats(address)
    const referralCode = generateReferralCode(address)
    const referralLink = `https://flowfi-crypto.vercel.app/setup?ref=${referralCode}`

    return NextResponse.json({
      address: stats.address,
      referralCode,
      referralLink,
      stats: {
        totalReferrals: stats.totalReferrals,
        activeReferrals: stats.activeReferrals,
        totalEarned: stats.totalEarned,
        monthlyEarnings: stats.monthlyEarnings,
      },
      referrals: stats.referrals.map(r => ({
        referred: r.referred,
        createdAt: new Date(r.createdAt).toISOString(),
        expiresAt: new Date(r.expiresAt).toISOString(),
        earned: r.totalEarned,
        isActive: r.isActive,
        daysRemaining: r.isActive
          ? Math.ceil((r.expiresAt - Date.now()) / (24 * 60 * 60 * 1000))
          : 0,
      })),
      config: {
        feeSharePercent: `${REFERRAL_FEE_SHARE * 100}%`,
        durationMonths: REFERRAL_DURATION_MS / (30 * 24 * 60 * 60 * 1000),
      },
    })
  }

  // Return referral program info
  return NextResponse.json({
    program: {
      name: 'ENSIO Referral Program',
      feeShare: `${REFERRAL_FEE_SHARE * 100}%`,
      duration: '6 months',
      description: 'Earn 50% of protocol fees from users you refer for 6 months',
    },
    howItWorks: [
      'Get your unique referral link from your dashboard',
      'Share it with friends and businesses',
      'When they sign up and receive payments, you earn 50% of the protocol fee',
      'Earnings continue for 6 months per referral',
    ],
    example: {
      scenario: 'You refer a freelancer who receives $10,000/month',
      theirTier: 'Growth (0.10% fee)',
      monthlyFee: '$10',
      yourShare: '$5/month',
      sixMonthTotal: '$30',
    },
  })
}

/**
 * POST /api/referral
 * Register a new referral
 *
 * Body: { referrer: string, referred: string }
 * Or: { code: string, referred: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { referrer, referred, code } = body

    // Decode referrer from code if provided
    let resolvedReferrer = referrer
    if (code && !referrer) {
      resolvedReferrer = decodeReferralCode(code)
      if (!resolvedReferrer) {
        return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 })
      }
    }

    if (!resolvedReferrer || !referred) {
      return NextResponse.json(
        { error: 'Missing required fields: referrer (or code) and referred' },
        { status: 400 }
      )
    }

    const result = registerReferral(resolvedReferrer, referred)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      referral: {
        referrer: resolvedReferrer.toLowerCase(),
        referred: referred.toLowerCase(),
        feeShare: `${REFERRAL_FEE_SHARE * 100}%`,
        expiresIn: '6 months',
      },
    })
  } catch (error) {
    console.error('Referral API error:', error)
    return NextResponse.json({ error: 'Failed to register referral' }, { status: 500 })
  }
}

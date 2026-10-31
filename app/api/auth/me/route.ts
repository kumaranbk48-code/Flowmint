import { NextResponse } from 'next/server'
import { ensureProfileExists, supabaseAdmin } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/security/session'

export async function POST(req: Request) {
  try {
    const auth = getAuthenticatedUser(req)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized: Session missing or invalid.' }, { status: 401 })
    }

    const { data } = await supabaseAdmin.auth.admin.getUserById(auth.userId)
    const user = data?.user || null

    if (!user) {
      return NextResponse.json({ error: 'User not found in Supabase.' }, { status: 404 })
    }

    const meta = user.user_metadata || {}

    // Check PostgreSQL public.profiles table
    const profile = await ensureProfileExists(user.id, {
      businessName: meta.businessName,
      ownerName: meta.ownerName || meta.name,
      businessType: meta.businessType,
      location: meta.location,
      openingBalance: meta.opening_balance ? Number(meta.opening_balance) : 0,
    })

    const business = {
      businessName: profile?.business_name || meta.businessName || '',
      ownerName: profile?.owner_name || meta.ownerName || meta.name || '',
      businessType: profile?.business_type || meta.businessType || '',
      location: profile?.location || meta.location || '',
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: business.ownerName || meta.name || user.email?.split('@')[0],
        email: user.email,
        isGoogle: !!meta.isGoogle,
      },
      business,
      openingBalance: profile?.opening_balance !== undefined ? Number(profile.opening_balance) : 0,
      onboardingCompleted: !!(business.businessName && business.ownerName) || !!meta.onboardingCompleted,
    })
  } catch (err) {
    console.error('Error fetching me from Supabase:', err)
    return NextResponse.json({ error: 'Failed to fetch user profile.' }, { status: 500 })
  }
}

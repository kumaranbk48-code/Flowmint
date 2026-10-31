import { NextResponse } from 'next/server'
import { supabaseAdmin, syncToProfilesTable } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/security/session'
import { sanitizeString } from '@/lib/security/validation'

export async function POST(req: Request) {
  try {
    const auth = getAuthenticatedUser(req)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized: Session missing or invalid.' }, { status: 401 })
    }

    const body = await req.json()
    const { business } = body

    if (!business || typeof business !== 'object') {
      return NextResponse.json({ error: 'Business details are required.' }, { status: 400 })
    }

    const businessName = sanitizeString(business.businessName, 120)
    const ownerName = sanitizeString(business.ownerName, 100)
    const businessType = sanitizeString(business.businessType, 80)
    const location = sanitizeString(business.location, 120)

    if (!businessName) {
      return NextResponse.json({ error: 'Business name is required.' }, { status: 400 })
    }
    if (!ownerName) {
      return NextResponse.json({ error: 'Owner name is required.' }, { status: 400 })
    }
    if (!businessType) {
      return NextResponse.json({ error: 'Business type is required.' }, { status: 400 })
    }
    if (!location) {
      return NextResponse.json({ error: 'Location is required.' }, { status: 400 })
    }

    // Find the target user strictly by authenticated session userId
    const { data } = await supabaseAdmin.auth.admin.getUserById(auth.userId)
    const targetUser = data?.user || null

    if (!targetUser) {
      return NextResponse.json({ error: 'User account not found in Supabase.' }, { status: 404 })
    }

    const updatedBusiness = {
      businessName,
      ownerName,
      businessType,
      location,
    }

    // 1. Update user_metadata in Supabase auth database
    const meta = targetUser.user_metadata || {}
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
      user_metadata: {
        ...meta,
        ...updatedBusiness,
        onboardingCompleted: true,
        updatedAt: new Date().toISOString(),
      },
    })

    if (updateError) {
      console.error('Supabase update metadata error:', updateError)
      return NextResponse.json(
        { error: 'Failed to save business details to Supabase database.' },
        { status: 500 },
      )
    }

    // 2. Sync to public.profiles table
    await syncToProfilesTable(targetUser.id, targetUser.email || '', updatedBusiness)

    return NextResponse.json({
      success: true,
      business: updatedBusiness,
    })
  } catch (err: unknown) {
    console.error('Save business error:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred while saving to database.' },
      { status: 500 },
    )
  }
}

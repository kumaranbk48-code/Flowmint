import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Admin client with service_role secret for backend data access
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Public auth client for validating credentials
export const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

/**
 * Find user by email across Supabase auth users
 */
export async function findUserByEmail(email: string) {
  if (!email) return null
  const target = email.trim().toLowerCase()

  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

    if (error || !data?.users) {
      console.error('Error fetching users from Supabase admin:', error)
      return null
    }

    return data.users.find((u) => u.email?.toLowerCase() === target) || null
  } catch (err) {
    console.error('Exception finding user in Supabase:', err)
    return null
  }
}

/**
 * Ensures a record exists in public.profiles table for foreign key constraints.
 * Does not overwrite existing non-empty values.
 */
export async function ensureProfileExists(
  userId: string,
  initialData?: {
    businessName?: string
    ownerName?: string
    businessType?: string
    location?: string
    openingBalance?: number
    language?: string
  },
) {
  if (!userId) return null

  try {
    // 1. Check if profile already exists
    const { data: existing, error: selectErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (!selectErr && existing) {
      return existing
    }

    // 2. Insert new profile
    const newProfile = {
      id: userId,
      business_name: initialData?.businessName || '',
      owner_name: initialData?.ownerName || '',
      business_type: initialData?.businessType || '',
      location: initialData?.location || '',
      opening_balance: initialData?.openingBalance !== undefined ? initialData.openingBalance : 1000,
      language: initialData?.language || 'en-IN',
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('profiles')
      .insert(newProfile)
      .select()
      .single()

    if (!insertErr && inserted) {
      return inserted
    }

    console.error('Failed to create profile row:', insertErr)
    return null
  } catch (err) {
    console.error('Exception ensuring profile exists:', err)
    return null
  }
}

/**
 * Sync business profile details to public.profiles table.
 */
export async function syncToProfilesTable(
  userId: string,
  _email: string,
  business: {
    businessName: string
    ownerName: string
    businessType: string
    location: string
  },
) {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: userId,
          business_name: business.businessName,
          owner_name: business.ownerName,
          business_type: business.businessType,
          location: business.location,
        },
        { onConflict: 'id' },
      )
      .select()

    if (error) {
      console.error('Error syncing to public.profiles:', error)
    }
    return data
  } catch (err) {
    console.error('Exception syncing to profiles table:', err)
    return null
  }
}

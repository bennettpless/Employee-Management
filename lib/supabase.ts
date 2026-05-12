import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

let serviceClient: SupabaseClient | null = null

export const getServiceSupabase = () => {
  if (serviceClient) return serviceClient

  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
  return serviceClient
}

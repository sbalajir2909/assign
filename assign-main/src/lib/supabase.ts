import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lwnrmytprplcrshxusev.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3bnJteXRwcnBsY3JzaHh1c2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0OTczMTcsImV4cCI6MjA4ODA3MzMxN30.kzvy_vQLOWHMQpPSr56XuwOsV83zGWq3xtI7xJ_UZAY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'implicit',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  }
})

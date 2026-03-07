'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    // Handle both PKCE code and implicit token flows
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        router.push('/')
      } else if (event === 'INITIAL_SESSION' && session) {
        router.push('/')
      } else if (event === 'INITIAL_SESSION' && !session) {
        router.push('/login')
      }
    })
  }, [router])

  return (
    <main style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#444', fontFamily: 'monospace', fontSize: '13px' }}>signing you in...</p>
    </main>
  )
}

'use client'

export const dynamic = 'force-dynamic'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    let active = true

    const finishAuth = async () => {
      const params = new URLSearchParams(window.location.search)
      const authCode = params.get('code')
      const authError = params.get('error_description') || params.get('error')

      if (authError) return false

      if (authCode) {
        const { error } = await supabase.auth.exchangeCodeForSession(authCode)
        if (error) {
          console.error('[auth callback]', error)
          return false
        }
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!active) return false
      if (session) {
        router.replace('/dashboard')
        return true
      }
      return false
    }

    finishAuth().then(hasSession => {
      if (!hasSession && active) router.replace('/login')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (session) router.replace('/dashboard')
      else if (event === 'SIGNED_OUT') router.replace('/login')
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [router])

  return (
    <main style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#444', fontFamily: 'DM Mono, monospace', fontSize: '13px' }}>authenticating...</div>
    </main>
  )
}

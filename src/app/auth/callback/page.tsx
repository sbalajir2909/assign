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
      const { data: { session } } = await supabase.auth.getSession()
      if (!active) return false
      if (session) {
        router.replace('/dashboard')
        return true
      }
      return false
    }

    finishAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      if (session) router.replace('/dashboard')
    })

    const timeout = window.setTimeout(async () => {
      const hasSession = await finishAuth()
      if (!hasSession && active) router.replace('/login')
    }, 1500)

    return () => {
      active = false
      window.clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [router])

  return (
    <main style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#444', fontFamily: 'DM Mono, monospace', fontSize: '13px' }}>authenticating...</div>
    </main>
  )
}

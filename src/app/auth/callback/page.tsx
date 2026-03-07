'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const handleCallback = async () => {
      const { data, error } = await supabase.auth.getSession()
      
      if (data.session) {
        router.push('/')
        return
      }

      // Try exchanging the code from URL
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (!exchangeError) {
          router.push('/')
          return
        }
      }

      router.push('/login')
    }

    handleCallback()
  }, [router])

  return (
    <main style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#444', fontFamily: 'monospace', fontSize: '13px' }}>signing you in...</p>
    </main>
  )
}

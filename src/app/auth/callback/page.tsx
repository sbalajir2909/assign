'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()
  const [status, setStatus] = useState('starting...')

  useEffect(() => {
    const handleCallback = async () => {
      const url = window.location.href
      setStatus('url: ' + url)
      
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      setStatus('code: ' + (code ? code.substring(0, 20) + '...' : 'NONE'))

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        setStatus('exchange result: ' + (error ? 'ERROR: ' + error.message : 'SUCCESS, user: ' + data.session?.user?.email))
        if (!error && data.session) {
          setTimeout(() => router.push('/'), 2000)
        }
      } else {
        const { data } = await supabase.auth.getSession()
        setStatus('no code, session: ' + (data.session ? data.session.user.email : 'NONE'))
        setTimeout(() => router.push(data.session ? '/' : '/login'), 2000)
      }
    }

    handleCallback()
  }, [router])

  return (
    <main style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#00FF87', fontFamily: 'monospace', fontSize: '13px', padding: '20px', textAlign: 'center' }}>{status}</p>
    </main>
  )
}

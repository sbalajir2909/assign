'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Navigation } from '@/components/navigation'
import { Hero } from '@/components/sections/hero'
import { Reframe } from '@/components/sections/reframe'
import { Features } from '@/components/sections/features'
import { Demo } from '@/components/sections/demo'
import { Gamification } from '@/components/sections/gamification'
import { Testimonials } from '@/components/sections/testimonials'
import { Cta } from '@/components/sections/cta'

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <main className="min-h-screen w-full bg-background text-foreground font-sans">
      <Navigation isLoggedIn={isLoggedIn} />
      <Hero />
      <Reframe />
      <Features />
      <Demo />
      <Gamification />
      <Testimonials />
      <Cta />

      <footer className="bg-foreground text-background py-8 border-t border-background/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="font-mono font-bold tracking-tight text-xl flex items-center gap-2">
            <svg width="20" height="24" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12.8492 24.4945H24V29.962C21.4073 29.8743 18.7213 30.0785 16.1397 29.9643C13.2258 29.836 10.5209 28.6067 9.12138 26.2387C7.89229 24.1602 8.13447 21.3862 9.84793 19.5837C11.735 17.5994 14.3309 15.8416 16.2082 13.8537C19.9804 9.86039 15.2696 3.92914 9.85055 5.88817C8.31789 6.44251 6.26305 8.52334 6.26305 10.061V25.0229H0.00261097L0 10.3523C0.79504 1.90009 11.1462 -3.1849 19.0385 2.24729C23.735 5.47977 25.7161 12.2296 21.5888 16.5295C18.9993 19.2277 15.6103 21.6416 12.9465 24.3173L12.8492 24.4945Z" fill="currentColor" />
            </svg>
            ASSIGN
          </div>
          <p className="font-mono text-sm text-muted">© {new Date().getFullYear()} Assign Learning Inc.</p>
          <div className="flex gap-6 font-mono text-sm uppercase">
            <a href="#" className="hover:text-primary transition-colors">Twitter</a>
            <a href="#" className="hover:text-primary transition-colors">Discord</a>
            <a href="#" className="hover:text-primary transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import NoteCard from '@/components/NoteCard'
import type { KCNote } from '@/lib/types'

const B2C_API = '/api/b2c'

export default function NotesPage() {
  const router = useRouter()
  const [notes, setNotes] = useState<KCNote[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
  const serif: React.CSSProperties = { fontFamily: 'var(--font-serif)' }

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      try {
        const res = await fetch(`${B2C_API}/notes/${session.user.id}`)
        if (res.ok) {
          const data = await res.json()
          setNotes(data)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  const filtered = search.trim()
    ? notes.filter(note =>
        note.concept_name.toLowerCase().includes(search.toLowerCase()) ||
        note.full_text.toLowerCase().includes(search.toLowerCase())
      )
    : notes

  return (
    <main style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)' }}>
      <style>{`
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--muted);border-radius:2px}
        .si{background:var(--card);border:2px solid var(--border);border-radius:4px;color:var(--foreground);font-size:13px;padding:10px 14px;outline:none;width:100%;font-family:var(--font-mono);transition:box-shadow 0.15s}.si:focus{box-shadow:4px 4px 0 0 hsl(0 0% 10%)}.si::placeholder{color:var(--muted-foreground)}
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 28px', borderBottom: '2px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span style={{ ...serif, fontSize: '22px', letterSpacing: '-0.5px' }}>assign</span>
          </Link>
          <span style={{ ...mono, fontSize: '11px', border: '1.5px solid var(--border)', borderRadius: '4px', padding: '3px 8px' }}>
            notes
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <a href="/progress" style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', textDecoration: 'none' }}>progress</a>
          <a href="/dashboard" style={{ ...mono, fontSize: '11px', color: 'var(--muted-foreground)', textDecoration: 'none' }}>← dashboard</a>
        </div>
      </div>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px' }}>
            your notes
          </h1>
          <p style={{ ...mono, margin: '6px 0 0', fontSize: '12px', color: 'var(--muted-foreground)' }}>
            {notes.length} concept{notes.length !== 1 ? 's' : ''} documented
          </p>
        </div>

        {notes.length > 0 && (
          <input
            className="si"
            type="text"
            placeholder="search concepts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        )}

        {loading ? (
          <div style={{ ...mono, fontSize: '13px', color: 'var(--muted-foreground)', textAlign: 'center', paddingTop: '40px' }}>
            loading notes...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: '60px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
            <p style={{ ...mono, fontSize: '13px', color: 'var(--muted-foreground)' }}>
              {notes.length === 0
                ? 'no notes yet — complete your first concept to generate one'
                : 'no notes match your search'}
            </p>
            {notes.length === 0 && (
              <Link
                href="/trek"
                style={{
                  ...mono,
                  fontSize: '12px',
                  color: 'var(--foreground)',
                  border: '2px solid var(--border)',
                  borderRadius: '4px',
                  padding: '8px 16px',
                  textDecoration: 'none',
                  boxShadow: '3px 3px 0 0 hsl(0 0% 10%)',
                }}
              >
                start learning →
              </Link>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
            {filtered.map(note => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

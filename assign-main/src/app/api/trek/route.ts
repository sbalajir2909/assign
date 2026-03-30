import { NextRequest, NextResponse } from 'next/server'

const TREK_API_URL = process.env.TREK_API_URL || 'http://127.0.0.1:8000'

async function trekFetch(path: string, body: object) {
  const res = await fetch(`${TREK_API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`trek-api ${res.status}: ${text}`)
  }
  return res.json()
}

export async function POST(req: NextRequest) {
  let body: {
    action?: string
    session_id?: string
    user_id?: string
    message?: string
    roadmap_id?: string
  } = {}

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 })
  }

  const { action, session_id, user_id, message, roadmap_id } = body

  try {
    // ── Start new session ──────────────────────────────────────────────────
    if (action === 'start') {
      if (!user_id) {
        return NextResponse.json({ error: 'user_id required' }, { status: 400 })
      }
      const data = await trekFetch('/trek/session', { user_id })
      return NextResponse.json(data)
    }

    // ── Send message ───────────────────────────────────────────────────────
    if (action === 'message') {
      if (!session_id || !user_id || !message) {
        return NextResponse.json(
          { error: 'session_id, user_id, message required' },
          { status: 400 }
        )
      }
      const data = await trekFetch('/trek/message', {
        session_id,
        user_id,
        message,
        roadmap_id: roadmap_id || null,
      })
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'invalid action' }, { status: 400 })

  } catch (err) {
    console.error('[trek route]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'trek-api error' },
      { status: 500 }
    )
  }
}

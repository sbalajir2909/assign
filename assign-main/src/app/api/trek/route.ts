import { NextRequest, NextResponse } from 'next/server'

function getTrekApiUrl() {
  const explicitUrl =
    process.env.TREK_API_URL ||
    process.env.NEXT_PUBLIC_TREK_API_URL

  if (explicitUrl) {
    return explicitUrl.replace(/\/$/, '')
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'http://127.0.0.1:8000'
  }

  throw new Error('TREK_API_URL is not configured for production')
}

export async function POST(req: NextRequest) {
  let body: {
    action?: string
    session_id?: string
    user_id?: string
    message?: string
    roadmap_id?: string
    phase?: string
    topic_id?: string
    syllabus_base64?: string
    syllabus_mime_type?: string
    review_kc_id?: string
  } = {}

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 })
  }

  const { action, session_id, user_id, message, roadmap_id, phase, topic_id, syllabus_base64, syllabus_mime_type, review_kc_id } = body

  try {
    const trekApiUrl = getTrekApiUrl()
    // ── Start new session ──────────────────────────────────────────────────
    if (action === 'start') {
      if (!user_id) {
        return NextResponse.json({ error: 'user_id required' }, { status: 400 })
      }
      const sessionPayload: Record<string, string> = { user_id: user_id! }
      if (syllabus_base64) sessionPayload.syllabus_base64 = syllabus_base64
      if (syllabus_mime_type) sessionPayload.syllabus_mime_type = syllabus_mime_type
      if (review_kc_id) sessionPayload.review_kc_id = review_kc_id
      if (roadmap_id) sessionPayload.roadmap_id = roadmap_id

      const res = await fetch(`${trekApiUrl}/api/b2c/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionPayload),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`trek-api ${res.status}: ${text}`)
      }
      const data = await res.json()
      return NextResponse.json(data)
    }

    // ── Send message — streams SSE back to the browser ─────────────────────
    if (action === 'message') {
      if (!session_id || !user_id || !message) {
        return NextResponse.json(
          { error: 'session_id, user_id, message required' },
          { status: 400 }
        )
      }
      const upstream = await fetch(`${trekApiUrl}/api/b2c/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id,
          user_id,
          message,
          phase: phase || 'discovery',
          topic_id: topic_id || '',
          roadmap_id: roadmap_id || null,
        }),
      })
      if (!upstream.ok) {
        const text = await upstream.text()
        throw new Error(`trek-api ${upstream.status}: ${text}`)
      }
      // Pass the SSE stream straight through — do not buffer or JSON-parse it.
      return new Response(upstream.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
      })
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const userId = searchParams.get('userId') || searchParams.get('user_id')
  const sessionId = searchParams.get('sessionId') || searchParams.get('session_id')

  try {
    const trekApiUrl = getTrekApiUrl()
    if (action === 'review' && userId) {
      const res = await fetch(`${trekApiUrl}/api/b2c/review/${userId}`)
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`trek-api ${res.status}: ${text}`)
      }
      const data = await res.json()
      return NextResponse.json(data)
    }

    if (action === 'report' && sessionId) {
      const res = await fetch(`${trekApiUrl}/api/b2c/report/${sessionId}`)
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`trek-api ${res.status}: ${text}`)
      }
      const data = await res.json()
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  } catch (err) {
    console.error('[trek route get]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'trek-api error' },
      { status: 500 }
    )
  }
}

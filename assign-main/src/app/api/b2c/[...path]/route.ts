import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const TREK_API_URL = process.env.TREK_API_URL || 'http://127.0.0.1:8000'

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const upstreamUrl = new URL(
    `${TREK_API_URL.replace(/\/$/, '')}/api/b2c/${path.map(encodeURIComponent).join('/')}`
  )
  upstreamUrl.search = req.nextUrl.search

  const headers = new Headers()
  const accept = req.headers.get('accept')
  const contentType = req.headers.get('content-type')

  if (accept) headers.set('accept', accept)
  if (contentType) headers.set('content-type', contentType)

  const upstream = await fetch(upstreamUrl.toString(), {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text(),
  })

  const responseHeaders = new Headers()
  const forwardHeaders = ['content-type', 'cache-control', 'x-accel-buffering']

  for (const header of forwardHeaders) {
    const value = upstream.headers.get(header)
    if (value) responseHeaders.set(header, value)
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}

export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(req, context)
}

export async function POST(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(req, context)
}

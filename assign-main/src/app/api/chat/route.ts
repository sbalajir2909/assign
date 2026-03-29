export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { SPARK_PROMPT, TREK_PROMPT, RECALL_PROMPT, BUILD_PROMPT } from '@/lib/prompts'

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const CF_API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN
const CF_MODEL      = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

export async function POST(req: NextRequest) {
  const { messages, mode } = await req.json()

  const systemPrompt = mode === 'trek' ? TREK_PROMPT
    : mode === 'recall' ? RECALL_PROMPT
    : mode === 'build' ? BUILD_PROMPT
    : SPARK_PROMPT

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        max_tokens: 400,
        temperature: 0.7,
      }),
    }
  )

  const data = await response.json() as { result?: { response?: string }, errors?: { message: string }[] }

  if (!response.ok || !data.result) {
    const err = data.errors?.[0]?.message ?? 'Cloudflare AI request failed'
    return NextResponse.json({ error: err }, { status: 500 })
  }

  return NextResponse.json({ reply: data.result.response })
}
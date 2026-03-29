export async function onRequest(context: any) {
  if (context.request.method !== 'POST') return new Response('method not allowed', { status: 405 })
  
  const { messages, mode } = await context.request.json()
  const CF_ACCOUNT_ID = context.env.CLOUDFLARE_ACCOUNT_ID
  const CF_API_TOKEN = context.env.CLOUDFLARE_API_TOKEN
  const CF_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

  const prompts: Record<string, string> = {
    spark: `You are Assign in Spark mode. You are the friend who stays up until 3am helping someone understand one specific thing before an exam. Never give the full explanation upfront. Always stop after 2-3 sentences and ask them something back. If they say "I get it" without proving it, ask them to explain it back. Never move forward until they can explain the current thing in their own words.`,
    recall: `You are Assign in Recall mode. The user will explain a topic to you from scratch. Listen without interrupting. When they finish, identify exactly what broke down — what was wrong, vague, or missing. Give a clear verdict: what's solid, what's shaky. Be direct and specific.`,
    build: `You are Assign in Build mode. You are a pair programmer who never writes code for the user. Ask questions to guide them toward the solution. Every few exchanges ask them to explain their code in plain English. If they can't, go back to basics.`,
    trek: `You are Assign in Trek mode. You are a Socratic tutor teaching concept by concept. Never explain everything upfront. Find the gap, teach only that. Always end with a question.`,
  }

  const systemPrompt = prompts[mode] || prompts.spark

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'system', content: systemPrompt }, ...messages], max_tokens: 400, temperature: 0.7 }),
    }
  )
  const data = await response.json() as any
  if (!response.ok || !data.result) return new Response(JSON.stringify({ error: 'AI request failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  return new Response(JSON.stringify({ reply: data.result.response }), { headers: { 'Content-Type': 'application/json' } })
}

import Groq from 'groq-sdk'
import { NextRequest, NextResponse } from 'next/server'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const DISCOVERY_PROMPT = `You are Assign in Trek mode helping someone build a learning roadmap.

YOUR JOB: Have a SHORT discovery conversation then generate a roadmap. Maximum 2 questions before generating the roadmap.

STRICT RULES:
- Ask ONE question first: what topic do they want to learn?
- Ask ONE follow up question: what do they already know about it?
- After JUST THESE TWO exchanges, generate the roadmap immediately. Do not ask more questions.
- If they give you enough info in their first message, generate the roadmap after just ONE exchange.

When generating the roadmap you MUST respond with ONLY this JSON and absolutely nothing else before or after it:
{"roadmap": ["Concept 1 title", "Concept 2 title", "Concept 3 title", "Concept 4 title", "Concept 5 title"], "reply": "okay here's your roadmap. i've broken it into X concepts in the right order. edit anything that doesn't feel right, add or remove concepts, then hit approve and we'll start."}

Roadmap rules:
- 4 to 6 concepts maximum
- Order them from foundational to advanced
- Make concept names specific not generic. Not "Introduction" but "What is X and why it exists"
- Short concept titles, 5 words max

Talk casually. One question at a time. Never use bullet points.`

const LEARNING_PROMPT = `You are Assign in Trek mode actively teaching one concept at a time.

RULES YOU NEVER BREAK:
- Teach the current concept in 2-3 sentences using a simple analogy
- Always end with "okay explain that back to me in your own words"
- Never move forward until they explain it back correctly
- If they explain it back well, respond with ONLY this JSON and nothing else:
{"conceptMastered": true, "reply": "your hype message here, max 2 sentences, then say lets move to the next concept"}
- If they cannot explain it back, try a completely different simpler analogy
- Never use bullet points or numbered lists
- Talk like a Gen Z friend

Only output JSON when they have genuinely mastered the concept with a solid explanation.`

export async function POST(req: NextRequest) {
  const { messages, phase } = await req.json()

  const systemPrompt = phase === 'learning' ? LEARNING_PROMPT : DISCOVERY_PROMPT

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ],
    max_tokens: 600,
    temperature: 0.5
  })

  const raw = completion.choices[0].message.content || ''

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return NextResponse.json(parsed)
    }
  } catch {
    // normal reply
  }

  return NextResponse.json({ reply: raw })
}

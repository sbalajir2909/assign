import Groq from 'groq-sdk'
import { NextRequest, NextResponse } from 'next/server'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const DISCOVERY_PROMPT = `You are Assign helping someone start a learning journey. Ask them what topic they want to learn and what they already know. Be casual and warm. One question at a time. Never use bullet points. Keep it short.`

const ROADMAP_PROMPT = `Based on this conversation, generate a learning roadmap as a JSON array of concept titles. Respond with ONLY a valid JSON array, nothing else, no explanation, no text before or after:
["Concept 1", "Concept 2", "Concept 3", "Concept 4", "Concept 5"]

Rules:
- 4 to 6 concepts maximum
- Order from foundational to advanced
- Concept names must be specific and short, 5 words max
- No generic names like "Introduction"`

const LEARNING_PROMPT = `You are Assign teaching one concept at a time from a roadmap. Teach simply using one analogy then ask them to explain it back. End every message with "okay explain that back to me in your own words." If they explain it back correctly end your message with [CONCEPT_MASTERED]. Never use bullet points. Talk like a Gen Z friend. Keep it short.`

export async function POST(req: NextRequest) {
  const { messages, phase, generateRoadmap, conversationHistory } = await req.json()

  if (generateRoadmap) {
    const summary = conversationHistory.map((m: {role: string, content: string}) => `${m.role}: ${m.content}`).join('\n')
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: ROADMAP_PROMPT },
        { role: 'user', content: `Generate roadmap from this:\n${summary}` }
      ],
      max_tokens: 200,
      temperature: 0.3
    })
    const raw = completion.choices[0].message.content || ''
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const roadmap = JSON.parse(jsonMatch[0])
        return NextResponse.json({ roadmap })
      }
    } catch {
      return NextResponse.json({ roadmap: ['Basics', 'Core concepts', 'Practical use', 'Advanced topics'] })
    }
  }

  if (phase === 'learning') {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: LEARNING_PROMPT }, ...messages],
      max_tokens: 400,
      temperature: 0.7
    })
    const raw = completion.choices[0].message.content || ''
    const conceptMastered = raw.includes('[CONCEPT_MASTERED]')
    const reply = raw.replace('[CONCEPT_MASTERED]', '').trim()
    return NextResponse.json({ reply, conceptMastered })
  }

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'system', content: DISCOVERY_PROMPT }, ...messages],
    max_tokens: 200,
    temperature: 0.7
  })

  return NextResponse.json({ reply: completion.choices[0].message.content || '' })
}

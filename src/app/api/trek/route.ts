import Groq from 'groq-sdk'
import { NextRequest, NextResponse } from 'next/server'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const DISCOVERY_PROMPT = `You are Assign helping someone build a learning roadmap. Have a casual conversation to understand what they want to learn.

Ask MAXIMUM 2 questions total before you have enough info:
- Question 1: what topic do they want to learn?
- Question 2: what do they already know about it?

After you have the topic and their level, end your message with exactly this tag on a new line:
[READY_FOR_ROADMAP]

Talk casually. One question at a time. Never use bullet points.`

const ROADMAP_PROMPT = `Based on this conversation, generate a learning roadmap as a JSON array of concept titles.

Respond with ONLY a valid JSON array, nothing else:
["Concept 1", "Concept 2", "Concept 3", "Concept 4", "Concept 5"]

Rules:
- 4 to 6 concepts maximum
- Order from foundational to advanced  
- Concept names must be specific, 5 words max
- No generic names like "Introduction" - use specific names like "What variables actually are"`

const LEARNING_PROMPT = `You are Assign teaching one concept at a time from a roadmap.

Teach the current concept simply using one analogy. Then ask them to explain it back.
End every message with "okay explain that back to me in your own words."

If they explain it back correctly, end your message with exactly:
[CONCEPT_MASTERED]

Never use bullet points. Talk like a Gen Z friend. Keep it short.`

export async function POST(req: NextRequest) {
  const { messages, phase } = await req.json()

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
    max_tokens: 300,
    temperature: 0.7
  })

  const raw = completion.choices[0].message.content || ''
  const readyForRoadmap = raw.includes('[READY_FOR_ROADMAP]')
  const reply = raw.replace('[READY_FOR_ROADMAP]', '').trim()

  if (readyForRoadmap) {
    const conversationSummary = messages.map((m: {role: string, content: string}) => `${m.role}: ${m.content}`).join('\n')
    
    const roadmapCompletion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: ROADMAP_PROMPT },
        { role: 'user', content: `Generate a roadmap based on this conversation:\n${conversationSummary}` }
      ],
      max_tokens: 200,
      temperature: 0.3
    })

    const roadmapRaw = roadmapCompletion.choices[0].message.content || ''
    
    try {
      const jsonMatch = roadmapRaw.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const roadmap = JSON.parse(jsonMatch[0])
        return NextResponse.json({ 
          reply: reply || "okay i've built your roadmap. check it out on the left, edit anything that feels off, then hit approve and we'll start.",
          roadmap 
        })
      }
    } catch {
      // fall through
    }
  }

  return NextResponse.json({ reply })
}

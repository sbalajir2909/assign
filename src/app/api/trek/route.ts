import Groq from 'groq-sdk'
import { NextRequest, NextResponse } from 'next/server'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const SCRAPER_URL = process.env.SCRAPER_URL || 'https://assign-scraper-production.up.railway.app'

const DISCOVERY_QUESTIONS = [
  "what topic do you want to understand end to end?",
  "okay and what's your current level with this — never touched it, heard of it, or used it a bit?",
  "got it. what's the goal — understand the concepts deeply, build something with it, or prep for an exam/interview?",
  "last one — how much time do you have to learn this? like per day and overall."
]

const PLANNER_SYSTEM = `You are a teaching strategist. Given a learner profile and concept, decide the teaching strategy.

Respond ONLY with valid JSON:
{
  "strategy": "gap_fill | analogy_first | example_driven | definition_heavy",
  "openingPrompt": "The exact question to ask the learner to surface what they already know",
  "likelyGaps": ["gap 1", "gap 2"],
  "focusAreas": ["what to emphasize given their goal"]
}

strategy guide:
- gap_fill: learner has some knowledge, find and fill the specific gaps
- analogy_first: complete beginner, build intuition before formality
- example_driven: goal is to build, learn through doing
- definition_heavy: goal is exam/interview, precision matters`

const TEACHER_SYSTEM = `You are Assign, a brutally effective Socratic tutor using the Feynman technique.

Your job is NOT to explain everything. Your job is to find what the learner doesn't know and teach only that gap.

Rules:
- Always open by asking what they already know — never assume
- When they explain something back, identify EXACTLY what's missing or fuzzy
- Teach the gap only, not the whole concept
- Use concrete analogies for abstract things
- Keep responses under 150 words
- End EVERY message with a question that makes them explain something back
- When their explanation is genuinely clean and complete, end with [CONCEPT_MASTERED]
- Talk like a smart Gen Z friend, no corporate tone, no bullet points
- Never say "great job" or "exactly right" — just move to the next gap`

type Message = { role: 'user' | 'assistant' | 'system'; content: string }

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { phase, messages, generateRoadmap, discoveryAnswers, conceptTitle, learnerProfile, questionIndex } = body

  // ── Discovery ─────────────────────────────────────────────────────────────
  if (phase === 'discovery') {
    const idx = questionIndex ?? 0
    if (idx < DISCOVERY_QUESTIONS.length) {
      return NextResponse.json({ reply: DISCOVERY_QUESTIONS[idx], nextQuestionIndex: idx + 1 })
    }
    return NextResponse.json({ reply: "okay i have everything i need. building your course now...", done: true })
  }

  // ── Generate course via scraper ───────────────────────────────────────────
  if (generateRoadmap && discoveryAnswers) {
    try {
      const scraperRes = await fetch(`${SCRAPER_URL}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discoveryAnswers),
        signal: AbortSignal.timeout(30000)
      })

      if (!scraperRes.ok) throw new Error(`scraper returned ${scraperRes.status}`)
      const scraperData = await scraperRes.json()

      if (scraperData.course) {
        return NextResponse.json({
          course: scraperData.course,
          sourcesHit: scraperData.context?.sourcesHit || []
        })
      }
    } catch (e) {
      console.error('[trek] scraper failed, falling back to LLM:', e)
    }

    // fallback: LLM-only course generation
    const { topic, level, goal, time } = discoveryAnswers
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `Generate a course plan as JSON: { gist: { emphasis, outcomes, prereqs }, concepts: [{ title, description, why, subtopics, estimatedMinutes, prereq, sources }] }. 5-7 concepts. Respond with JSON only.`
        },
        { role: 'user', content: `Topic: ${topic}, Level: ${level}, Goal: ${goal}, Time: ${time}` }
      ],
      max_tokens: 1500,
      temperature: 0.3
    })
    const raw = completion.choices[0].message.content || ''
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) return NextResponse.json({ course: JSON.parse(jsonMatch[0]), sourcesHit: [] })
    } catch {
      return NextResponse.json({ error: 'course generation failed' }, { status: 500 })
    }
  }

  // ── Plan teaching strategy ────────────────────────────────────────────────
  if (phase === 'plan' && conceptTitle && learnerProfile) {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: PLANNER_SYSTEM },
        { role: 'user', content: `Concept: ${conceptTitle}\nLearner: ${JSON.stringify(learnerProfile)}` }
      ],
      max_tokens: 300,
      temperature: 0.3
    })
    const raw = completion.choices[0].message.content || ''
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) return NextResponse.json({ plan: JSON.parse(jsonMatch[0]) })
    } catch {
      return NextResponse.json({ plan: { strategy: 'gap_fill', openingPrompt: `tell me what you already know about ${conceptTitle}`, likelyGaps: [], focusAreas: [] } })
    }
  }

  // ── Teach ─────────────────────────────────────────────────────────────────
  if (phase === 'learning' && messages) {
    const systemWithContext = learnerProfile
      ? `${TEACHER_SYSTEM}\n\nLearner profile: ${JSON.stringify(learnerProfile)}\nCurrent concept: ${conceptTitle}`
      : TEACHER_SYSTEM

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: systemWithContext }, ...messages],
      max_tokens: 400,
      temperature: 0.7
    })

    const raw = completion.choices[0].message.content || ''
    const conceptMastered = raw.includes('[CONCEPT_MASTERED]')
    const reply = raw.replace('[CONCEPT_MASTERED]', '').trim()
    return NextResponse.json({ reply, conceptMastered })
  }

  return NextResponse.json({ error: 'invalid request' }, { status: 400 })
}

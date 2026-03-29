import Groq from 'groq-sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const getGroq = () => new Groq({ apiKey: process.env.GROQ_API_KEY })
const SCRAPER_URL = process.env.SCRAPER_URL || 'https://assign-scraper-production.up.railway.app'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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
}`

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

const SUMMARY_SYSTEM = `You are a curriculum writer. Generate a clean concept summary for a student who just mastered this concept through Socratic dialogue.

Respond ONLY with valid JSON:
{
  "summary": "3 clean paragraphs explaining the concept thoroughly. First: what it is and core intuition. Second: how it works mechanically. Third: when and why to use it.",
  "keyMentalModels": ["Mental model 1 in one sentence", "Mental model 2", "Mental model 3"],
  "commonMistakes": ["Mistake 1 and why people make it", "Mistake 2", "Mistake 3"],
  "sources": [{"label": "Official Docs", "url": "https://..."}, {"label": "Wikipedia", "url": "https://..."}]
}`

type Message = { role: 'user' | 'assistant' | 'system'; content: string }

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    phase,
    messages,
    generateRoadmap,
    discoveryAnswers,
    conceptTitle,
    learnerProfile,
    questionIndex,
    roadmapId,
    conceptIndex,
    conversationContext
  } = body

  // ── Discovery ──────────────────────────────────────────────────────────────
  if (phase === 'discovery') {
    const idx = questionIndex ?? 0
    return NextResponse.json({
      reply: DISCOVERY_QUESTIONS[idx],
      nextQuestionIndex: idx + 1
    })
  }

  // ── Generate course ────────────────────────────────────────────────────────
  if (generateRoadmap && discoveryAnswers) {
    try {
      const scraperRes = await fetch(`${SCRAPER_URL}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discoveryAnswers),
        signal: AbortSignal.timeout(30000)
      })
      if (!scraperRes.ok) throw new Error(`scraper ${scraperRes.status}`)
      const scraperData = await scraperRes.json()
      if (scraperData.course) {
        return NextResponse.json({
          course: scraperData.course,
          sourcesHit: scraperData.context?.sourcesHit || []
        })
      }
    } catch (e) {
      console.error('[trek] scraper failed, falling back:', e)
    }

    // LLM fallback
    const { topic, level, goal, time } = discoveryAnswers
    const completion = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `Generate a course as JSON: { gist: { emphasis, outcomes, prereqs }, concepts: [{ title, description, why, subtopics, estimatedMinutes, prereq, sources }] }. 5-7 concepts. Specific titles only — never "Introduction" or "Basics". Respond with JSON only.`
        },
        { role: 'user', content: `Topic: ${topic}, Level: ${level}, Goal: ${goal}, Time: ${time}` }
      ],
      max_tokens: 2000,
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

  // ── Plan teaching strategy ─────────────────────────────────────────────────
  if (phase === 'plan' && conceptTitle && learnerProfile) {
    const completion = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: PLANNER_SYSTEM },
        { role: 'user', content: `Concept: ${conceptTitle}\nLearner: ${JSON.stringify(learnerProfile)}` }
      ],
      max_tokens: 400,
      temperature: 0.3
    })
    const raw = completion.choices[0].message.content || ''
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) return NextResponse.json({ plan: JSON.parse(jsonMatch[0]) })
    } catch {
      return NextResponse.json({
        plan: {
          strategy: 'gap_fill',
          openingPrompt: `okay let's start. tell me what you already know about ${conceptTitle}`,
          likelyGaps: [],
          focusAreas: []
        }
      })
    }
  }

  // ── Teaching loop ──────────────────────────────────────────────────────────
  if (phase === 'learning' && messages) {
    const systemContent = `${TEACHER_SYSTEM}

Learner profile: ${JSON.stringify(learnerProfile)}
Current concept: ${conceptTitle}
${conversationContext ? `Context from previous session: ${conversationContext}` : ''}`

    const completion = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: systemContent }, ...messages],
      max_tokens: 400,
      temperature: 0.7
    })

    const raw = completion.choices[0].message.content || ''
    const conceptMastered = raw.includes('[CONCEPT_MASTERED]')
    const reply = raw.replace('[CONCEPT_MASTERED]', '').trim()
    return NextResponse.json({ reply, conceptMastered })
  }

  // ── Generate concept summary after mastery ────────────────────────────────
  if (phase === 'generateSummary' && conceptTitle && messages) {
    const conversationText = messages
      .map((m: Message) => `${m.role}: ${m.content}`)
      .join('\n')

    const completion = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM },
        {
          role: 'user',
          content: `Concept: ${conceptTitle}\nLearner goal: ${learnerProfile?.goal || 'understand deeply'}\n\nConversation where they learned this:\n${conversationText.slice(0, 3000)}`
        }
      ],
      max_tokens: 1000,
      temperature: 0.3
    })

    const raw = completion.choices[0].message.content || ''
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const summaryData = JSON.parse(jsonMatch[0])

        // Save to DB if we have roadmapId
        if (roadmapId && conceptIndex !== undefined) {
          // Get user_id from roadmap
          const db = getSupabase()
          const { data: roadmap } = await db
            .from('roadmaps')
            .select('user_id')
            .eq('id', roadmapId)
            .single()

          if (roadmap) {
            await db.from('concept_materials').upsert({
              roadmap_id: roadmapId,
              user_id: roadmap.user_id,
              concept_index: conceptIndex,
              concept_title: conceptTitle,
              summary: summaryData.summary,
              key_mental_models: summaryData.keyMentalModels,
              common_mistakes: summaryData.commonMistakes,
              sources: summaryData.sources || []
            }, { onConflict: 'roadmap_id,concept_index' })
          }
        }

        return NextResponse.json({ summary: summaryData })
      }
    } catch (e) {
      console.error('[summary] parse failed:', e)
    }
    return NextResponse.json({ error: 'summary generation failed' }, { status: 500 })
  }

  return NextResponse.json({ error: 'invalid request' }, { status: 400 })
}
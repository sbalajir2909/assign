import Groq from 'groq-sdk'
import { NextRequest, NextResponse } from 'next/server'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// ── Discovery agent ──────────────────────────────────────────────────────────
const DISCOVERY_QUESTIONS = [
  "what topic do you want to understand end to end?",
  "okay and what's your current level with this — never touched it, heard of it, or used it a bit?",
  "got it. what's the goal — understand the concepts deeply, build something with it, or prep for an exam/interview?",
  "last one — how much time do you have to learn this? like per day and overall."
]

// ── Roadmap generator ────────────────────────────────────────────────────────
const ROADMAP_SYSTEM = `You are a curriculum designer. Given a learner profile, generate a detailed course plan.

Respond ONLY with valid JSON in this exact shape, no text before or after:
{
  "gist": {
    "emphasis": "2-3 sentences on what this course emphasizes and why based on the learner's goal",
    "outcomes": ["outcome 1", "outcome 2", "outcome 3"],
    "prereqs": ["prereq 1"] 
  },
  "concepts": [
    {
      "title": "Concept title (max 5 words)",
      "why": "One sentence: why this concept matters for their specific goal",
      "subtopics": ["subtopic 1", "subtopic 2", "subtopic 3"],
      "estimatedMinutes": 15,
      "prereq": null
    }
  ]
}

Rules:
- 5-7 concepts, ordered foundational to advanced
- estimatedMinutes should be realistic: 10-30 per concept
- prereq is either null or the title of a previous concept
- outcomes are specific things they can DO after completing the course
- tailor everything to the learner's stated goal and time constraints
- prereqs array in gist: only list things they need to know BEFORE starting, empty array if none`

// ── Planner agent ─────────────────────────────────────────────────────────────
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

// ── Teacher agent ─────────────────────────────────────────────────────────────
const TEACHER_SYSTEM = `You are Assign, a brutally effective Socratic tutor. You use the Feynman technique.

Your job is NOT to explain everything. Your job is to find what the learner doesn't know and teach only that.

Rules:
- Never explain what they already demonstrated they understand
- When they explain something back, identify EXACTLY what's missing or fuzzy — name it specifically
- Teach the gap, not the whole concept
- Use concrete analogies for abstract things
- Keep responses under 150 words
- End EVERY message with a question that makes them explain something back
- When their explanation is genuinely clean and complete, end with [CONCEPT_MASTERED]
- Talk like a smart Gen Z friend, no corporate tone, no bullet points
- Never say "great job" or "exactly right" — just move to the next gap`

// ── Assessor agent ────────────────────────────────────────────────────────────
const ASSESSOR_SYSTEM = `You are an assessor. Given a learner's explanation, determine if they truly understand the concept.

Respond ONLY with valid JSON:
{
  "understood": true | false,
  "gaps": ["specific gap 1", "specific gap 2"],
  "clarityScore": 1-10,
  "feedback": "one sentence on what was good and what was missing"
}

Be strict. Understanding means:
- They can explain it simply without jargon
- They know WHY not just WHAT
- They can connect it to something concrete
- No critical misconceptions`

type Message = { role: 'user' | 'assistant' | 'system'; content: string }

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { phase, messages, generateRoadmap, discoveryAnswers, conceptTitle, learnerProfile, questionIndex } = body

  // ── Discovery: ask next question ──────────────────────────────────────────
  if (phase === 'discovery') {
    const idx = questionIndex ?? 0
    if (idx < DISCOVERY_QUESTIONS.length) {
      return NextResponse.json({ reply: DISCOVERY_QUESTIONS[idx], nextQuestionIndex: idx + 1 })
    }
    return NextResponse.json({ reply: "okay i have everything i need. building your roadmap now...", done: true })
  }

  // ── Generate full course from 4 answers ───────────────────────────────────
  if (generateRoadmap && discoveryAnswers) {
    const { topic, level, goal, time } = discoveryAnswers
    const prompt = `Learner profile:
- Topic: ${topic}
- Current level: ${level}
- Goal: ${goal}
- Available time: ${time}

Generate a complete course plan for this learner.`

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: ROADMAP_SYSTEM },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.3
    })

    const raw = completion.choices[0].message.content || ''
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const course = JSON.parse(jsonMatch[0])
        return NextResponse.json({ course })
      }
    } catch {
      return NextResponse.json({ error: 'failed to parse course' }, { status: 500 })
    }
  }

  // ── Plan teaching strategy for a concept ─────────────────────────────────
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

  // ── Assess learner explanation ─────────────────────────────────────────────
  if (phase === 'assess') {
    const lastUserMessage = messages.filter((m: Message) => m.role === 'user').pop()
    if (!lastUserMessage) return NextResponse.json({ understood: false, gaps: [], clarityScore: 0, feedback: '' })

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: ASSESSOR_SYSTEM },
        { role: 'user', content: `Concept being taught: ${conceptTitle}\nLearner's explanation: ${lastUserMessage.content}` }
      ],
      max_tokens: 200,
      temperature: 0.1
    })
    const raw = completion.choices[0].message.content || ''
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) return NextResponse.json({ assessment: JSON.parse(jsonMatch[0]) })
    } catch {
      return NextResponse.json({ assessment: { understood: false, gaps: [], clarityScore: 5, feedback: '' } })
    }
  }

  // ── Teach: main conversation ───────────────────────────────────────────────
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

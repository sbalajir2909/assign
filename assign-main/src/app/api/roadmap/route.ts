import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url) throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_URL')
  if (!key) throw new Error('Missing env var: SUPABASE_SERVICE_KEY')
  return createClient(url, key)
}

const flattenSprintConcepts = (roadmap: Record<string, unknown>) => {
  const sprintPlan = roadmap.sprint_plan as { sprints?: Array<{ concepts?: Array<{ title?: string }> }> } | null
  if (sprintPlan?.sprints?.length) {
    return sprintPlan.sprints.flatMap((sprint) => sprint.concepts || []).map((concept) => concept.title || '')
  }
  const legacyConcepts = roadmap.concepts as Array<{ title?: string }> | undefined
  return (legacyConcepts || []).map((concept) => concept.title || '')
}

const getRoadmapMeta = (roadmap: Record<string, unknown>) => {
  const profile =
    roadmap.learner_profile && typeof roadmap.learner_profile === 'object'
      ? (roadmap.learner_profile as Record<string, unknown>)
      : {}

  return {
    topicId: typeof profile._topic_id === 'string' ? profile._topic_id : '',
    activeSessionId: typeof profile._session_id === 'string' ? profile._session_id : '',
  }
}

const resolveTopicId = async (
  supabase: ReturnType<typeof createClient>,
  roadmap: Record<string, unknown>
) => {
  const meta = getRoadmapMeta(roadmap)
  if (meta.topicId) return meta.topicId

  const { data: topicRow } = await supabase
    .from('topics')
    .select('id')
    .eq('user_id', roadmap.user_id)
    .eq('title', roadmap.topic)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return topicRow?.id || ''
}

const buildLiveConceptSnapshot = async (
  supabase: ReturnType<typeof createClient>,
  roadmap: Record<string, unknown>,
  topicId: string
) => {
  if (!topicId) {
    const fallbackConcepts = Array.isArray(roadmap.concepts) ? roadmap.concepts : []
    return {
      concepts: fallbackConcepts,
      currentConceptIndex: Number(roadmap.current_concept_index || 0),
    }
  }

  const [{ data: kcs }, { data: states }] = await Promise.all([
    supabase
      .from('knowledge_components')
      .select('id, title, order_index')
      .eq('topic_id', topicId)
      .order('order_index'),
    supabase
      .from('student_kc_state')
      .select('kc_id, status, p_learned')
      .eq('user_id', roadmap.user_id)
      .eq('topic_id', topicId),
  ])

  if (!kcs?.length) {
    const fallbackConcepts = Array.isArray(roadmap.concepts) ? roadmap.concepts : []
    return {
      concepts: fallbackConcepts,
      currentConceptIndex: Number(roadmap.current_concept_index || 0),
    }
  }

  const stateByKcId = new Map((states || []).map((row) => [row.kc_id, row]))
  let currentConceptIndex = -1

  const concepts = kcs.map((kc, index) => {
    const studentState = stateByKcId.get(kc.id)
    const mastered = studentState?.status === 'mastered' || studentState?.status === 'force_advanced'
    if (!mastered && currentConceptIndex === -1) {
      currentConceptIndex = index
    }

    return {
      id: kc.id,
      title: kc.title,
      status: mastered ? 'done' : 'locked',
      p_learned: Number(studentState?.p_learned || 0),
      order_index: kc.order_index,
      source_status: studentState?.status || 'not_started',
    }
  })

  if (currentConceptIndex === -1) {
    currentConceptIndex = concepts.length ? concepts.length - 1 : 0
  }

  if (concepts[currentConceptIndex] && concepts[currentConceptIndex].status !== 'done') {
    concepts[currentConceptIndex] = {
      ...concepts[currentConceptIndex],
      status: 'current',
    }
  }

  return { concepts, currentConceptIndex }
}

const buildConversationHistory = async (
  supabase: ReturnType<typeof createClient>,
  roadmap: Record<string, unknown>,
  topicId: string
) => {
  if (!topicId) {
    return Array.isArray(roadmap.conversation_history) ? roadmap.conversation_history : []
  }

  const { data: chatRows } = await supabase
    .from('b2c_chat_history')
    .select('role, content, created_at')
    .eq('user_id', roadmap.user_id)
    .eq('topic_id', topicId)
    .order('created_at', { ascending: true })
    .limit(250)

  if (!chatRows?.length) {
    return Array.isArray(roadmap.conversation_history) ? roadmap.conversation_history : []
  }

  return chatRows.map((row) => ({
    role: row.role,
    content: row.content,
  }))
}

const hydrateRoadmap = async (
  supabase: ReturnType<typeof createClient>,
  roadmap: Record<string, unknown>,
  options: { includeHistory?: boolean } = {}
) => {
  const meta = getRoadmapMeta(roadmap)
  const topicId = await resolveTopicId(supabase, roadmap)
  const { concepts, currentConceptIndex } = await buildLiveConceptSnapshot(supabase, roadmap, topicId)
  const conversationHistory = options.includeHistory
    ? await buildConversationHistory(supabase, roadmap, topicId)
    : Array.isArray(roadmap.conversation_history) ? roadmap.conversation_history : []

  return {
    ...roadmap,
    topic_id: topicId || null,
    active_session_id: meta.activeSessionId || null,
    concepts,
    current_concept_index: currentConceptIndex,
    conversation_history: conversationHistory,
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const roadmapId = searchParams.get('id')
    const userId = searchParams.get('userId')

    if (roadmapId) {
      const { data: roadmap, error } = await getSupabase()
        .from('roadmaps')
        .select('*')
        .eq('id', roadmapId)
        .single()
      if (error || !roadmap) {
        return NextResponse.json({ error: error?.message || 'roadmap not found' }, { status: 404 })
      }
      const supabase = getSupabase()
      const hydratedRoadmap = await hydrateRoadmap(supabase, roadmap, { includeHistory: true })
      const conceptTitles = Array.isArray(hydratedRoadmap.concepts) && hydratedRoadmap.concepts.length
        ? hydratedRoadmap.concepts.map((concept: { title?: string }) => concept.title || '')
        : flattenSprintConcepts(hydratedRoadmap)
      const { data: noteOverlays } = await supabase
        .from('concept_materials')
        .select('*')
        .eq('roadmap_id', roadmapId)
        .order('concept_index')

      const topicId = typeof hydratedRoadmap.topic_id === 'string' ? hydratedRoadmap.topic_id : null

      let notesQuery = supabase
        .from('kc_notes')
        .select('concept_name, summary, key_points, the_analogy, student_analogy, watch_out, quick_reference, full_text')
        .eq('user_id', hydratedRoadmap.user_id)
      if (topicId) notesQuery = notesQuery.eq('topic_id', topicId)
      const { data: kcNotes } = await notesQuery.order('created_at')

      const manualByIndex = new Map((noteOverlays || []).map((row) => [row.concept_index, row]))
      const noteByTitle = new Map((kcNotes || []).map((row) => [row.concept_name, row]))

      const materials = conceptTitles
        .map((title, index) => {
          const note = noteByTitle.get(title)
          const manual = manualByIndex.get(index)
          if (!note && !manual?.user_notes) return null
          return {
            concept_index: index,
            concept_title: title,
            summary: note?.summary || '',
            quick_reference: note?.quick_reference || '',
            the_analogy: note?.the_analogy || '',
            key_points: Array.isArray(note?.key_points) ? note?.key_points : [],
            student_analogy: note?.student_analogy || '',
            watch_out: note?.watch_out || '',
            full_text: note?.full_text || '',
            user_notes: manual?.user_notes || '',
          }
        })
        .filter(Boolean)

      return NextResponse.json({ roadmap: hydratedRoadmap, materials })
    }

    if (userId) {
      const supabase = getSupabase()
      const { data: roadmaps, error } = await supabase
        .from('roadmaps')
        .select('id, user_id, topic, status, current_concept_index, concepts, created_at, last_studied, total_minutes_estimated, sources_hit, learner_profile, conversation_history')
        .eq('user_id', userId)
        .order('last_studied', { ascending: false })
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      const hydratedRoadmaps = await Promise.all((roadmaps || []).map((roadmap) => hydrateRoadmap(supabase, roadmap)))
      return NextResponse.json({ roadmaps: hydratedRoadmaps })
    }

    return NextResponse.json({ error: 'missing params' }, { status: 400 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId, topic, concepts, learnerProfile, sourcesHit, totalMinutes } = body
    const { data, error } = await getSupabase()
      .from('roadmaps')
      .insert({
        user_id: userId,
        topic,
        concepts,
        learner_profile: learnerProfile,
        sources_hit: sourcesHit || [],
        total_minutes_estimated: totalMinutes || 0,
        current_concept_index: 0,
        conversation_history: [],
        concept_summaries: [],
        status: 'active'
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ roadmap: data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { roadmapId, concepts, currentConceptIndex, conversationHistory, conceptSummaries, status, lastStudied, userNotes } = body
    const updates: Record<string, unknown> = { last_studied: lastStudied || new Date().toISOString() }
    if (concepts !== undefined) updates.concepts = concepts
    if (currentConceptIndex !== undefined) updates.current_concept_index = currentConceptIndex
    if (conversationHistory !== undefined) updates.conversation_history = conversationHistory
    if (conceptSummaries !== undefined) updates.concept_summaries = conceptSummaries
    if (status !== undefined) updates.status = status
    const supabase = getSupabase()

    if (userNotes && roadmapId) {
      const { data: roadmap, error: roadmapError } = await supabase
        .from('roadmaps')
        .select('id, user_id, topic, sprint_plan, concepts')
        .eq('id', roadmapId)
        .single()
      if (roadmapError || !roadmap) {
        return NextResponse.json({ error: roadmapError?.message || 'roadmap not found' }, { status: 404 })
      }
      const conceptTitles = flattenSprintConcepts(roadmap)
      const conceptTitle = userNotes.conceptTitle || conceptTitles[userNotes.conceptIndex] || `Concept ${userNotes.conceptIndex + 1}`
      const { error: userNotesError } = await supabase
        .from('concept_materials')
        .upsert({
          roadmap_id: roadmapId,
          user_id: roadmap.user_id,
          concept_index: userNotes.conceptIndex,
          concept_title: conceptTitle,
          summary: '',
          key_mental_models: [],
          common_mistakes: [],
          sources: [],
          user_notes: userNotes.notes || '',
        }, { onConflict: 'roadmap_id,concept_index' })
      if (userNotesError) {
        return NextResponse.json({ error: userNotesError.message }, { status: 500 })
      }
    }

    const { error } = await supabase
      .from('roadmaps')
      .update(updates)
      .eq('id', roadmapId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

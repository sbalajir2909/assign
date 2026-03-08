import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const roadmapId = searchParams.get('id')
  const userId = searchParams.get('userId')

  if (roadmapId) {
    // Load specific roadmap with its materials
    const { data: roadmap, error } = await supabase
      .from('roadmaps')
      .select('*')
      .eq('id', roadmapId)
      .single()

    if (error || !roadmap) {
      return NextResponse.json({ error: 'roadmap not found' }, { status: 404 })
    }

    const { data: materials } = await supabase
      .from('concept_materials')
      .select('*')
      .eq('roadmap_id', roadmapId)
      .order('concept_index')

    return NextResponse.json({ roadmap, materials: materials || [] })
  }

  if (userId) {
    // Load all roadmaps for dashboard
    const { data: roadmaps } = await supabase
      .from('roadmaps')
      .select('id, topic, status, current_concept_index, concepts, created_at, last_studied, total_minutes_estimated, sources_hit')
      .eq('user_id', userId)
      .order('last_studied', { ascending: false })

    return NextResponse.json({ roadmaps: roadmaps || [] })
  }

  return NextResponse.json({ error: 'missing params' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { userId, topic, concepts, learnerProfile, sourcesHit, totalMinutes } = body

  const { data, error } = await supabase
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
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const {
    roadmapId,
    concepts,
    currentConceptIndex,
    conversationHistory,
    conceptSummaries,
    status,
    lastStudied
  } = body

  const updates: Record<string, unknown> = { last_studied: lastStudied || new Date().toISOString() }
  if (concepts !== undefined) updates.concepts = concepts
  if (currentConceptIndex !== undefined) updates.current_concept_index = currentConceptIndex
  if (conversationHistory !== undefined) updates.conversation_history = conversationHistory
  if (conceptSummaries !== undefined) updates.concept_summaries = conceptSummaries
  if (status !== undefined) updates.status = status

  const { error } = await supabase
    .from('roadmaps')
    .update(updates)
    .eq('id', roadmapId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
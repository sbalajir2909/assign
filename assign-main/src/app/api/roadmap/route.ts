import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url) throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_URL')
  if (!key) throw new Error('Missing env var: SUPABASE_SERVICE_KEY')
  return createClient(url, key)
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
      const { data: materials } = await getSupabase()
        .from('concept_materials')
        .select('*')
        .eq('roadmap_id', roadmapId)
        .order('concept_index')
      return NextResponse.json({ roadmap, materials: materials || [] })
    }

    if (userId) {
      const { data: roadmaps, error } = await getSupabase()
        .from('roadmaps')
        .select('id, topic, status, current_concept_index, concepts, created_at, last_studied, total_minutes_estimated, sources_hit')
        .eq('user_id', userId)
        .order('last_studied', { ascending: false })
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ roadmaps: roadmaps || [] })
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
    const { roadmapId, concepts, currentConceptIndex, conversationHistory, conceptSummaries, status, lastStudied } = body
    const updates: Record<string, unknown> = { last_studied: lastStudied || new Date().toISOString() }
    if (concepts !== undefined) updates.concepts = concepts
    if (currentConceptIndex !== undefined) updates.current_concept_index = currentConceptIndex
    if (conversationHistory !== undefined) updates.conversation_history = conversationHistory
    if (conceptSummaries !== undefined) updates.concept_summaries = conceptSummaries
    if (status !== undefined) updates.status = status
    const { error } = await getSupabase()
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

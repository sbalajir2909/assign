export async function onRequest(context: any) {
  const url = new URL(context.request.url)
  const roadmapId = url.searchParams.get('id')
  const userId = url.searchParams.get('userId')

  const SUPABASE_URL = context.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_KEY = context.env.SUPABASE_SERVICE_KEY || context.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(JSON.stringify({ error: 'missing env vars' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  if (context.request.method === 'GET') {
    if (roadmapId) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/roadmaps?id=eq.${roadmapId}&select=*`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      })
      const data = await res.json() as any[]
      if (!data || data.length === 0) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
      
      const materialsRes = await fetch(`${SUPABASE_URL}/rest/v1/concept_materials?roadmap_id=eq.${roadmapId}&select=*&order=concept_index`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      })
      const materials = await materialsRes.json()
      return new Response(JSON.stringify({ roadmap: data[0], materials: materials || [] }), { headers: { 'Content-Type': 'application/json' } })
    }

    if (userId) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/roadmaps?user_id=eq.${userId}&select=id,topic,status,current_concept_index,concepts,created_at,last_studied,total_minutes_estimated,sources_hit&order=last_studied.desc`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
      })
      const data = await res.json()
      return new Response(JSON.stringify({ roadmaps: data || [] }), { headers: { 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'missing params' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  if (context.request.method === 'POST') {
    const body = await context.request.json()
    const { userId, topic, concepts, learnerProfile, sourcesHit, totalMinutes } = body
    const res = await fetch(`${SUPABASE_URL}/rest/v1/roadmaps`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({ user_id: userId, topic, concepts, learner_profile: learnerProfile, sources_hit: sourcesHit || [], total_minutes_estimated: totalMinutes || 0, current_concept_index: 0, conversation_history: [], concept_summaries: [], status: 'active' })
    })
    const data = await res.json() as any[]
    return new Response(JSON.stringify({ roadmap: data[0] }), { headers: { 'Content-Type': 'application/json' } })
  }

  if (context.request.method === 'PATCH') {
    const body = await context.request.json()
    const { roadmapId, concepts, currentConceptIndex, conversationHistory, conceptSummaries, status, lastStudied } = body
    const updates: Record<string, unknown> = { last_studied: lastStudied || new Date().toISOString() }
    if (concepts !== undefined) updates.concepts = concepts
    if (currentConceptIndex !== undefined) updates.current_concept_index = currentConceptIndex
    if (conversationHistory !== undefined) updates.conversation_history = conversationHistory
    if (conceptSummaries !== undefined) updates.concept_summaries = conceptSummaries
    if (status !== undefined) updates.status = status
    await fetch(`${SUPABASE_URL}/rest/v1/roadmaps?id=eq.${roadmapId}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    })
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('method not allowed', { status: 405 })
}

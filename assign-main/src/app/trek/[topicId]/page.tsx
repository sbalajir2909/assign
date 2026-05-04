'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface TopicRow {
  id: string
  title: string
}

interface RoadmapRow {
  id: string
  topic: string
  learner_profile?: { _topic_id?: string }
}

function TrekTopicBridgeInner() {
  const params = useParams()
  const router = useRouter()
  const topicId = params.topicId as string

  const [error, setError] = useState('')

  useEffect(() => {
    const bridge = async () => {
      try {
        if (topicId === 'new') {
          router.replace('/trek')
          return
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          router.replace('/login')
          return
        }

        const uid = session.user.id
        const [roadmapsRes, topicsRes] = await Promise.all([
          fetch(`/api/roadmap?userId=${uid}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }),
          fetch(`/api/b2c/topics/${uid}`),
        ])

        const roadmapsJson = await roadmapsRes.json().catch(() => ({ roadmaps: [] }))
        const topicsJson = await topicsRes.json().catch(() => ([]))
        const roadmaps = (roadmapsJson.roadmaps || []) as RoadmapRow[]
        const topics = (topicsJson || []) as TopicRow[]
        const topic = topics.find((item) => item.id === topicId)

        const matchingRoadmap = roadmaps.find(
          (roadmap) =>
            roadmap.learner_profile?._topic_id === topicId ||
            (!!topic && roadmap.topic.toLowerCase() === topic.title.toLowerCase())
        )

        router.replace(matchingRoadmap ? `/trek?resume=${matchingRoadmap.id}` : '/trek')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to open this trek')
      }
    }

    bridge()
  }, [router, topicId])

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--background)', flexDirection: 'column', gap: '12px' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--muted-foreground)' }}>
        {error || 'opening trek...'}
      </span>
    </div>
  )
}

export default function TrekTopicBridgePage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--background)' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--muted-foreground)' }}>
            opening trek...
          </span>
        </div>
      }
    >
      <TrekTopicBridgeInner />
    </Suspense>
  )
}

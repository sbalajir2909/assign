'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BuildNav } from '@/components/build/build-nav'
import { TopicSelector } from '@/components/build/topic-selector'
import { AiIntro } from '@/components/build/ai-intro'
import { Workspace } from '@/components/build/workspace'
import type { Topic } from '@/components/build/topics'

type Step = 'topic' | 'ai-intro' | 'workspace'
type AiMode = 'chat' | 'voice'

export default function BuildPage() {
  const [step, setStep] = useState<Step>('topic')
  const [topic, setTopic] = useState<Topic | null>(null)
  const [aiMode, setAiMode] = useState<AiMode>('chat')

  if (step === 'workspace' && topic) {
    return <Workspace topic={topic} aiMode={aiMode} onBack={() => setStep('topic')} />
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <BuildNav />

      <div className="flex-1">
        <AnimatePresence mode="wait">
          {step === 'topic' && (
            <motion.div
              key="topic"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <TopicSelector
                onSelect={(selectedTopic) => {
                  setTopic(selectedTopic)
                  setStep('ai-intro')
                }}
              />
            </motion.div>
          )}

          {step === 'ai-intro' && topic && (
            <motion.div
              key="ai-intro"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <AiIntro
                topic={topic}
                onConfirm={(mode) => {
                  setAiMode(mode)
                  setStep('workspace')
                }}
                onBack={() => setStep('topic')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

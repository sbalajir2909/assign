'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { MessageCircle, Mic, ArrowRight, ChevronLeft } from 'lucide-react'
import type { Topic } from '@/components/build/topics'

type AiMode = 'chat' | 'voice'

type Props = {
  topic: Topic
  onConfirm: (mode: AiMode) => void
  onBack: () => void
}

const AssignLogo = () => (
  <svg width="28" height="34" viewBox="0 0 24 30" fill="none">
    <path
      d="M12.8492 24.4945H24V29.962C21.4073 29.8743 18.7213 30.0785 16.1397 29.9643C13.2258 29.836 10.5209 28.6067 9.12138 26.2387C7.89229 24.1602 8.13447 21.3862 9.84793 19.5837C11.735 17.5994 14.3309 15.8416 16.2082 13.8537C19.9804 9.86039 15.2696 3.92914 9.85055 5.88817C8.31789 6.44251 6.26305 8.52334 6.26305 10.061V25.0229H0.00261097L0 10.3523C0.79504 1.90009 11.1462 -3.1849 19.0385 2.24729C23.735 5.47977 25.7161 12.2296 21.5888 16.5295C18.9993 19.2277 15.6103 21.6416 12.9465 24.3173L12.8492 24.4945Z"
      fill="currentColor"
    />
  </svg>
)

export function AiIntro({ topic, onConfirm, onBack }: Props) {
  const [selected, setSelected] = useState<AiMode | null>(null)
  const [voiceNotice, setVoiceNotice] = useState(false)

  const handleSelect = (mode: AiMode) => {
    if (mode === 'voice') {
      setVoiceNotice(true)
      setSelected('voice')
      return
    }

    setSelected(mode)
    setVoiceNotice(false)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="max-w-lg w-full">
        <motion.button
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={onBack}
          className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors mb-12"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to topics
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-10"
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 20 }}
            className="w-20 h-20 bg-foreground text-background flex items-center justify-center mx-auto mb-6 border-2 border-foreground brutalist-shadow-lg"
          >
            <AssignLogo />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="border-2 border-foreground bg-card p-6 text-left brutalist-shadow mb-6"
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Assign AI
            </p>
            <p className="font-sans text-base leading-relaxed text-foreground">
              Hey! I&apos;m your coding companion for <span className="font-bold">{topic.name}</span>.
            </p>
            <p className="font-sans text-base leading-relaxed text-foreground mt-2">
              I&apos;ll catch your mistakes before they catch you and explain them like a friend, not a
              textbook. No copy-pasting answers. We figure it out together.
            </p>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="font-sans font-bold text-xl mb-2"
          >
            How should I talk to you?
          </motion.h2>
          <p className="font-sans text-sm text-muted-foreground">You can switch anytime during your session.</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="grid grid-cols-2 gap-4 mb-6"
        >
          <button
            onClick={() => handleSelect('chat')}
            className={`border-2 p-6 text-left transition-all ${
              selected === 'chat'
                ? 'bg-foreground text-background border-foreground brutalist-shadow'
                : 'border-foreground bg-card hover:bg-muted'
            }`}
          >
            <MessageCircle className={`w-8 h-8 mb-4 ${selected === 'chat' ? 'text-background' : 'text-primary'}`} />
            <p className={`font-sans font-bold text-base mb-1 ${selected === 'chat' ? 'text-background' : ''}`}>
              Chat with me
            </p>
            <p
              className={`font-sans text-sm leading-relaxed ${
                selected === 'chat' ? 'text-background/70' : 'text-muted-foreground'
              }`}
            >
              I&apos;ll pop up in the corner whenever I spot something. Type back whenever.
            </p>
          </button>

          <button
            onClick={() => handleSelect('voice')}
            className={`border-2 p-6 text-left transition-all ${
              selected === 'voice'
                ? 'bg-foreground text-background border-foreground brutalist-shadow'
                : 'border-foreground bg-card hover:bg-muted'
            }`}
          >
            <Mic className={`w-8 h-8 mb-4 ${selected === 'voice' ? 'text-background' : 'text-primary'}`} />
            <p className={`font-sans font-bold text-base mb-1 ${selected === 'voice' ? 'text-background' : ''}`}>
              Voice mode
            </p>
            <p
              className={`font-sans text-sm leading-relaxed ${
                selected === 'voice' ? 'text-background/70' : 'text-muted-foreground'
              }`}
            >
              I&apos;ll speak to you. You can talk back or type, whichever feels natural.
            </p>
          </button>
        </motion.div>

        {voiceNotice && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-2 border-primary bg-primary/5 p-4 mb-6 font-sans text-sm leading-relaxed"
          >
            <span className="font-bold text-primary">Note:</span> Voice mode uses your browser&apos;s
            microphone and speech synthesis. Allow microphone access when prompted.
          </motion.div>
        )}

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: selected ? 1 : 0.3 }}
          onClick={() => selected && onConfirm(selected)}
          disabled={!selected}
          className="w-full flex items-center justify-between px-6 py-4 bg-foreground text-background border-2 border-foreground brutalist-shadow font-mono font-bold text-sm uppercase tracking-widest hover:bg-primary hover:border-primary transition-colors disabled:cursor-not-allowed"
        >
          <span>Let&apos;s start building</span>
          <ArrowRight className="w-4 h-4" />
        </motion.button>
      </div>
    </div>
  )
}

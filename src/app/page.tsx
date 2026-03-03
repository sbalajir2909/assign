'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Mode = 'spark' | 'trek' | 'recall' | null

export default function Home() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <h1 className="text-3xl font-semibold tracking-tight text-white mb-1">assign</h1>
        <p className="text-zinc-500 text-sm mb-12">what do you want to learn today?</p>

        <div className="space-y-4">
          <button
            onClick={() => router.push('/spark')}
            className="w-full text-left bg-zinc-900 hover:bg-zinc-800 transition rounded-2xl px-6 py-5 group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-medium text-lg">spark ⚡</span>
              <span className="text-zinc-600 text-xs group-hover:text-zinc-400 transition">quick session →</span>
            </div>
            <p className="text-zinc-400 text-sm leading-relaxed">stuck on one specific thing? explain it to me and i'll break it down until you actually get it. five minutes, one concept, done.</p>
          </button>

          <button
            onClick={() => router.push('/trek')}
            className="w-full text-left bg-zinc-900 hover:bg-zinc-800 transition rounded-2xl px-6 py-5 group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-medium text-lg">trek 🗺️</span>
              <span className="text-zinc-600 text-xs group-hover:text-zinc-400 transition">full journey →</span>
            </div>
            <p className="text-zinc-400 text-sm leading-relaxed">want to understand something end to end? tell me the topic and we'll go through it together, piece by piece, until the whole thing makes sense.</p>
          </button>

          <button
            onClick={() => router.push('/recall')}
            className="w-full text-left bg-zinc-900 hover:bg-zinc-800 transition rounded-2xl px-6 py-5 group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-medium text-lg">recall 🧠</span>
              <span className="text-zinc-600 text-xs group-hover:text-zinc-400 transition">test yourself →</span>
            </div>
            <p className="text-zinc-400 text-sm leading-relaxed">learned something recently? let's find out what actually stuck. i'll ask you questions, catch the gaps, and fix only what's broken.</p>
          </button>

          <button
            onClick={() => router.push('/build')}
            className="w-full text-left bg-zinc-900 hover:bg-zinc-800 transition rounded-2xl px-6 py-5 group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-medium text-lg">build 🛠️</span>
              <span className="text-zinc-600 text-xs group-hover:text-zinc-400 transition">code with assign →</span>
            </div>
            <p className="text-zinc-400 text-sm leading-relaxed">building something and stuck? write your code, assign watches, catches your mistakes, and asks you questions until you actually understand what you wrote.</p>
          </button>
        </div>
      </div>
    </main>
  )
}

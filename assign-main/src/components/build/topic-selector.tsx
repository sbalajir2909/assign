'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, ArrowRight, Zap } from 'lucide-react'
import { TOPICS, SEARCH_SUGGESTIONS, type Topic } from '@/components/build/topics'

type Props = { onSelect: (topic: Topic) => void }

const difficultyColor: Record<string, string> = {
  Beginner: 'bg-green-100 text-green-800 border-green-300',
  Intermediate: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  Advanced: 'bg-red-100 text-red-800 border-red-300',
}

export function TopicSelector({ onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeFilter, setActiveFilter] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let list = TOPICS

    if (activeFilter) {
      list = list.filter(
        (topic) =>
          topic.difficulty === activeFilter ||
          topic.tags.some((tag) => tag.toLowerCase() === activeFilter.toLowerCase())
      )
    }

    if (query.trim()) {
      const lowered = query.toLowerCase()
      list = list.filter(
        (topic) =>
          topic.name.toLowerCase().includes(lowered) ||
          topic.description.toLowerCase().includes(lowered) ||
          topic.tags.some((tag) => tag.toLowerCase().includes(lowered))
      )
    }

    return list
  }, [query, activeFilter])

  const suggestions = useMemo(
    () =>
      query
        ? SEARCH_SUGGESTIONS.filter((suggestion) => suggestion.toLowerCase().includes(query.toLowerCase())).slice(0, 5)
        : [],
    [query]
  )

  const filters = ['Beginner', 'Intermediate', 'Advanced', 'Python', 'JavaScript', 'CS']

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="max-w-5xl mx-auto w-full px-6 pt-16 pb-24 flex flex-col gap-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center"
        >
          <div className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest border-2 border-foreground px-4 py-2 mb-8 brutalist-shadow">
            <Zap className="w-3 h-3 text-primary" />
            Build Mode
          </div>
          <h1
            className="text-5xl md:text-7xl lg:text-8xl leading-[0.9] mb-6"
            style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic' }}
          >
            What do you want
            <br />
            to build today?
          </h1>
          <p className="font-sans text-lg text-muted-foreground max-w-xl mx-auto">
            Pick a topic. We&apos;ll write real code together, with an AI that explains every mistake
            like a friend, not a compiler.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-w-2xl mx-auto w-full"
        >
          <div className="relative border-2 border-foreground brutalist-shadow bg-background">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search topics, languages, concepts..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              className="w-full bg-transparent pl-12 pr-4 py-4 font-sans text-base focus:outline-none placeholder:text-muted-foreground"
            />
          </div>

          <AnimatePresence>
            {showSuggestions && suggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="absolute top-full left-0 right-0 z-20 bg-background border-2 border-foreground border-t-0 brutalist-shadow"
              >
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onMouseDown={() => {
                      setQuery(suggestion)
                      setShowSuggestions(false)
                    }}
                    className="w-full text-left px-4 py-3 font-sans text-sm hover:bg-muted transition-colors flex items-center gap-3"
                  >
                    <Search className="w-3.5 h-3.5 text-muted-foreground" />
                    {suggestion}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex flex-wrap gap-2 justify-center"
        >
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(activeFilter === filter ? null : filter)}
              className={`font-mono text-xs font-bold uppercase tracking-wider px-4 py-2 border-2 transition-colors ${
                activeFilter === filter
                  ? 'bg-foreground text-background border-foreground'
                  : 'border-foreground/30 text-muted-foreground hover:border-foreground hover:text-foreground'
              }`}
            >
              {filter}
            </button>
          ))}
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((topic, index) => {
              const Icon = topic.icon
              return (
                <motion.button
                  key={topic.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.25, delay: index * 0.04 }}
                  onClick={() => onSelect(topic)}
                  className="group text-left border-2 border-foreground bg-card p-6 brutalist-shadow-hover flex flex-col gap-4 hover:border-primary transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="w-11 h-11 border-2 border-foreground flex items-center justify-center bg-background group-hover:bg-primary group-hover:border-primary transition-colors">
                      <Icon className="w-5 h-5 group-hover:text-white transition-colors" />
                    </div>
                    {topic.popular && (
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest border border-primary text-primary px-2 py-0.5">
                        Popular
                      </span>
                    )}
                  </div>

                  <div className="flex-1">
                    <h3 className="font-sans font-bold text-lg mb-1 group-hover:text-primary transition-colors">
                      {topic.name}
                    </h3>
                    <p className="font-sans text-sm text-muted-foreground leading-relaxed">{topic.description}</p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1.5">
                      <span
                        className={`font-mono text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 border ${difficultyColor[topic.difficulty]}`}
                      >
                        {topic.difficulty}
                      </span>
                      {topic.languages.slice(0, 1).map((language) => (
                        <span
                          key={language}
                          className="font-mono text-[10px] uppercase tracking-wide px-2 py-0.5 border border-foreground/20 text-muted-foreground"
                        >
                          {language}
                        </span>
                      ))}
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
                </motion.button>
              )
            })}
          </AnimatePresence>

          {filtered.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full text-center py-16">
              <p className="font-sans text-muted-foreground text-lg">
                No topics match &quot;<span className="font-semibold text-foreground">{query}</span>&quot;
              </p>
              <button
                onClick={() => {
                  setQuery('')
                  setActiveFilter(null)
                }}
                className="mt-4 font-mono text-sm font-bold uppercase tracking-widest text-primary hover:underline"
              >
                Clear search
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";

const features = [
  {
    id: "built",
    num: "01",
    tag: "FOR BUILDERS",
    title: "Code like you have a senior dev on speed dial.",
    desc: "Built codes with you, teaches as it goes, drops projects after each level. Every breakthrough unlocks XP. Gamified from day one.",
    tagColor: "bg-blue-500",
    href: "/build",
    visual: (
      <div className="font-mono text-xs text-foreground p-5 bg-background h-full border-t-2 border-foreground flex flex-col gap-2.5">
        <div className="flex justify-between items-center pb-3 border-b border-foreground/10 mb-1">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
            <span className="ml-2 text-muted-foreground">main.ts</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-primary/20 text-primary px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase">LVL 4</div>
            <div className="bg-yellow-400 text-foreground px-2 py-1 text-[10px] font-bold">🔥 7</div>
          </div>
        </div>
        <div className="space-y-1 leading-relaxed">
          <p><span className="text-purple-500">function</span> <span className="text-blue-500">calculateXP</span><span className="text-foreground/60">(base, streak) {"{"}</span></p>
          <p className="pl-4 text-green-500 italic text-[10px]">// Assign: nice — can you see why this grows exponentially?</p>
          <p className="pl-4"><span className="text-orange-500">return</span> base * (1 + (streak * 0.1));</p>
          <p className="text-foreground/60">{"}"}</p>
        </div>
        <div className="mt-auto">
          <div className="flex justify-between text-[10px] mb-1 text-muted-foreground uppercase tracking-widest">
            <span>Progress</span><span>850 / 1000 XP</span>
          </div>
          <div className="h-2 border border-foreground/20 bg-muted">
            <div className="h-full bg-primary" style={{ width: "85%" }} />
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "spark",
    num: "02",
    tag: "FOR CURIOUS MINDS",
    title: "One question. Properly understood.",
    desc: "Not another wall of text from GPT. Spark flips it — you explain it back. It spots the gaps, closes them. You leave actually knowing it.",
    tagColor: "bg-yellow-400",
    href: "/spark",
    visual: (
      <div className="p-5 flex flex-col gap-3 h-full border-t-2 border-foreground bg-background justify-end">
        <div className="self-end max-w-[80%] bg-foreground text-background p-3.5 border-2 border-foreground brutalist-shadow-sm">
          <p className="text-sm leading-snug">So inflation is just when money loses value?</p>
        </div>
        <div className="self-start max-w-[82%] bg-background border-2 border-foreground p-3.5 brutalist-shadow-sm">
          <p className="text-sm leading-snug">close! but tell me — what happens to <em>prices</em> when money loses value? 🤔</p>
        </div>
        <div className="self-end max-w-[80%] bg-foreground text-background p-3.5 border-2 border-foreground brutalist-shadow-sm">
          <p className="text-sm leading-snug">oh — they go up!</p>
        </div>
        <div className="self-start max-w-[82%] bg-background border-2 border-foreground p-3.5 brutalist-shadow-sm">
          <p className="text-sm leading-snug">exactly. so what is inflation really? say it back to me 👏</p>
        </div>
      </div>
    ),
  },
  {
    id: "trek",
    num: "03",
    tag: "FOR LEARNERS",
    title: "Your personal Coursera. But actually personal.",
    desc: "Tell Assign what you want to learn. It builds a roadmap based on what you already know. Teaching style stays the same: you explain it, it checks you.",
    tagColor: "bg-green-400",
    href: "/trek",
    visual: (
      <div className="p-5 h-full border-t-2 border-foreground bg-background flex flex-col justify-center gap-3 relative">
        <div className="absolute left-[2.35rem] top-8 bottom-8 w-0.5 bg-foreground/10" />
        {[
          { label: "Python Basics", status: "done", xp: "250 XP" },
          { label: "Data Structures", status: "active", xp: "180 XP" },
          { label: "Algorithms", status: "locked", xp: "300 XP" },
          { label: "System Design", status: "locked", xp: "500 XP" },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-4 relative z-10">
            <div className={`w-4 h-4 border-2 border-foreground flex-shrink-0 flex items-center justify-center ${item.status === "done" ? "bg-green-400" : item.status === "active" ? "bg-primary animate-pulse" : "bg-muted"}`}>
              {item.status === "done" && <span className="text-foreground text-[8px]">✓</span>}
            </div>
            <div className={`flex-1 flex justify-between items-center py-2 px-3 border border-foreground/10 ${item.status === "active" ? "bg-primary/10 border-primary" : item.status === "locked" ? "opacity-40" : ""}`}>
              <span className={`font-mono text-xs uppercase tracking-wider ${item.status === "active" ? "font-bold" : ""}`}>{item.label}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{item.xp}</span>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "recall",
    num: "04",
    tag: "FOR EXAM WARRIORS",
    title: "Prep smarter. Not harder.",
    desc: "Flashcards got a glow-up. AI-generated question banks, spaced repetition, mock exams. Recall pinpoints your weak spots and drills them until they stick.",
    tagColor: "bg-red-400",
    href: "/recall",
    visual: (
      <div className="p-6 h-full border-t-2 border-foreground bg-background flex flex-col items-center justify-center gap-4">
        <motion.div
          animate={{ rotateY: [0, 180, 180, 0, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", times: [0, 0.3, 0.6, 0.9, 1] }}
          className="w-full max-h-[110px] relative"
          style={{ transformStyle: "preserve-3d", perspective: "800px" }}
        >
          <div className="absolute inset-0 bg-background border-2 border-foreground brutalist-shadow flex flex-col items-center justify-center p-4" style={{ backfaceVisibility: "hidden" }}>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Question</span>
            <span className="font-serif text-xl text-center">What is Mitosis?</span>
          </div>
          <div className="absolute inset-0 bg-foreground text-background border-2 border-foreground flex flex-col items-center justify-center p-4" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
            <span className="font-mono text-[10px] uppercase tracking-widest text-background/50 mb-2">Answer</span>
            <span className="font-sans text-sm text-center leading-snug">Cell division producing two genetically identical daughter cells.</span>
          </div>
        </motion.div>
        <div className="flex gap-3 mt-2">
          <div className="border-2 border-foreground px-4 py-2 font-mono text-xs uppercase tracking-wider bg-red-100 text-red-700 brutalist-shadow-sm">Again</div>
          <div className="border-2 border-foreground px-4 py-2 font-mono text-xs uppercase tracking-wider bg-yellow-100 text-yellow-700 brutalist-shadow-sm">Hard</div>
          <div className="border-2 border-foreground px-4 py-2 font-mono text-xs uppercase tracking-wider bg-green-100 text-green-700 brutalist-shadow-sm">Got it ✓</div>
        </div>
      </div>
    ),
  },
];

export function Features() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="features" ref={ref} className="py-32 bg-background relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-20">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-px flex-1 bg-foreground/10" />
            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">(02) What we do</span>
            <div className="h-px flex-1 bg-foreground/10" />
          </div>
          <div className="text-center">
            <h2 className="text-5xl md:text-7xl lg:text-8xl leading-[0.9]" style={{ fontFamily: "'Instrument Serif', serif", fontStyle: "italic" }}>
              Four ways to learn.
            </h2>
            <p className="font-mono text-base uppercase tracking-[0.2em] text-muted-foreground mt-6">Pick your weapon.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {features.map((feature, idx) => (
            <motion.div key={feature.id}
              initial={{ opacity: 0, y: 60 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: idx * 0.12, ease: [0.16, 1, 0.3, 1] }}
              className="group border-2 border-foreground brutalist-shadow-hover bg-card flex flex-col overflow-hidden">
              <div className="p-7 flex-1">
                <div className="flex items-center justify-between mb-6">
                  <span className="font-mono text-3xl font-bold text-foreground/20">{feature.num}</span>
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 ${feature.tagColor} border-2 border-foreground`} />
                    <span className="font-mono text-[11px] font-bold px-3 py-1 border-2 border-foreground bg-background brutalist-shadow-sm uppercase tracking-wider">{feature.tag}</span>
                  </div>
                </div>
                <h3 className="font-sans font-bold text-2xl mb-4 leading-tight">{feature.title}</h3>
                <p className="font-sans text-muted-foreground text-base leading-relaxed">{feature.desc}</p>
              </div>

              <div className="h-56 border-t-2 border-foreground bg-muted/40 overflow-hidden">{feature.visual}</div>

              <Link href={feature.href}
                className="flex items-center justify-between px-7 py-4 border-t-2 border-foreground bg-foreground text-background hover:bg-primary transition-colors duration-150">
                <span className="font-mono text-xs font-bold uppercase tracking-widest">Try {feature.tag.split(" ").pop()} →</span>
                <span className="font-mono text-[10px] text-background/50 uppercase tracking-widest">Live preview</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

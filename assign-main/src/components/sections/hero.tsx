'use client'

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

const topics = ["LAW", "FINANCE", "CODING", "AI", "MEDICINE", "DESIGN", "HISTORY", "PHILOSOPHY", "MATHS", "ECONOMICS", "BIOLOGY", "LITERATURE"];

export function Hero() {
  return (
    <section className="relative min-h-screen pt-28 pb-0 flex flex-col justify-between overflow-hidden">
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(to right, #1a1a1a12 1px, transparent 1px), linear-gradient(to bottom, #1a1a1a12 1px, transparent 1px)",
          backgroundSize: "4rem 4rem",
          maskImage: "radial-gradient(ellipse 80% 70% at 50% 50%, #000 50%, transparent 100%)",
        }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full flex flex-col items-center text-center flex-1 justify-center pb-20">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="mb-8 flex items-center gap-2 border-2 border-foreground px-5 py-2 bg-background brutalist-shadow">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="font-mono text-xs font-bold uppercase tracking-widest">Meet your new tutor</span>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.1 }} className="max-w-6xl mx-auto">
          <h1 className="text-[16vw] sm:text-[14vw] md:text-[12vw] lg:text-[10vw] xl:text-[9rem] leading-[0.82] tracking-tight text-foreground"
            style={{ fontFamily: "'Instrument Serif', serif", fontStyle: "italic" }}>
            that person.
          </h1>
          <p className="font-mono text-base sm:text-lg md:text-xl text-muted-foreground uppercase tracking-[0.25em] mt-6">
            for anything you want to learn.
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 1 }}
          className="w-full max-w-xl mt-16 space-y-4 text-left">
          <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.1, duration: 0.6, type: "spring", stiffness: 120 }} className="flex justify-end">
            <div className="bg-foreground text-background px-5 py-3.5 max-w-[82%] border-2 border-foreground brutalist-shadow">
              <p className="font-sans text-sm sm:text-base leading-snug">wait, why does my function return undefined here? 😭</p>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.9, duration: 0.3 }} className="flex justify-start">
            <div className="bg-background border-2 border-foreground px-4 py-3 brutalist-shadow flex items-center gap-2">
              <div className="flex gap-1 items-end h-4">
                <span className="w-1.5 h-1.5 bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Assign is thinking...</span>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 2.6, duration: 0.6, type: "spring", stiffness: 120 }} className="flex justify-start">
            <div className="bg-background px-5 py-3.5 max-w-[82%] border-2 border-foreground brutalist-shadow-sm">
              <p className="font-sans text-sm sm:text-base leading-snug text-foreground">good catch — let's trace through it together. what did you <em>expect</em> it to return on line 12?</p>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <div className="w-full border-y-2 border-foreground bg-primary py-3.5 overflow-hidden flex-shrink-0">
        <div className="flex animate-marquee whitespace-nowrap" style={{ width: "max-content" }}>
          {[...Array(4)].map((_, i) => (
            <span key={i} className="flex items-center font-mono font-bold text-sm sm:text-base tracking-[0.2em] uppercase text-foreground">
              {topics.map((topic, j) => (
                <span key={j} className="flex items-center">
                  <span className="mx-4">{topic}</span>
                  <span className="opacity-60">·</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

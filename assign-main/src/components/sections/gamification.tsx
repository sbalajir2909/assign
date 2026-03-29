'use client'

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

export function Gamification() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="py-32 bg-background" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="font-serif italic text-6xl md:text-8xl mb-6">Learning that actually sticks.</h2>
            <p className="font-sans text-xl text-muted-foreground mb-8">
              We ripped off the best parts of video games so you can't put education down. XP, streaks, levels. It works.
            </p>
            <ul className="space-y-6 font-mono text-lg uppercase tracking-wider">
              <li className="flex items-center gap-4">
                <div className="w-8 h-8 bg-green-400 border-2 border-foreground brutalist-shadow flex items-center justify-center text-foreground font-bold">1</div>
                Earn XP for every concept explained
              </li>
              <li className="flex items-center gap-4">
                <div className="w-8 h-8 bg-yellow-400 border-2 border-foreground brutalist-shadow flex items-center justify-center text-foreground font-bold">2</div>
                Maintain streaks to unlock perks
              </li>
              <li className="flex items-center gap-4">
                <div className="w-8 h-8 bg-blue-400 border-2 border-foreground brutalist-shadow flex items-center justify-center text-foreground font-bold">3</div>
                Level up your expertise
              </li>
            </ul>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-primary translate-x-4 translate-y-4 border-2 border-foreground pointer-events-none" />
            <div className="bg-card border-2 border-foreground p-8 relative z-10">
              <div className="flex justify-between items-end mb-8 border-b-2 border-foreground/10 pb-6">
                <div>
                  <p className="font-mono text-sm text-muted-foreground mb-1 uppercase">Current Rank</p>
                  <h3 className="font-sans font-bold text-4xl">Level 7 Coder</h3>
                </div>
                <div className="text-right">
                  <div className="text-5xl">🔥</div>
                  <p className="font-mono font-bold mt-2">12 DAY STREAK</p>
                </div>
              </div>

              <div className="space-y-8">
                <div>
                  <div className="flex justify-between font-mono text-sm font-bold mb-2">
                    <span>REACT BASICS</span><span>850 / 1000 XP</span>
                  </div>
                  <div className="h-6 w-full border-2 border-foreground bg-muted p-0.5">
                    <motion.div className="h-full bg-blue-500" initial={{ width: "0%" }}
                      animate={inView ? { width: "85%" } : {}} transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between font-mono text-sm font-bold mb-2">
                    <span>ALGORITHMS</span><span>420 / 500 XP</span>
                  </div>
                  <div className="h-6 w-full border-2 border-foreground bg-muted p-0.5">
                    <motion.div className="h-full bg-green-400" initial={{ width: "0%" }}
                      animate={inView ? { width: "84%" } : {}} transition={{ duration: 1.5, delay: 0.7, ease: "easeOut" }} />
                  </div>
                </div>
                <div className="pt-6 mt-6 border-t-2 border-foreground/10 text-center">
                  <span className="inline-block bg-yellow-400 text-foreground border-2 border-foreground font-mono font-bold px-4 py-2 brutalist-shadow-sm rotate-[-2deg]">
                    ⭐ NEW ACHIEVEMENT UNLOCKED: "BUG SQUASHER"
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

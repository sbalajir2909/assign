'use client'

import { useRef, useEffect, useState } from "react";
import { motion, useInView } from "framer-motion";

function AnimatedCounter({ value, duration = 2.5 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!inView) return;
    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentVal = Math.floor(eased * value);
      if (value >= 1_000_000_000) setDisplay((currentVal / 1_000_000_000).toFixed(1) + "B");
      else if (value >= 1_000_000) setDisplay((currentVal / 1_000_000).toFixed(0) + "M");
      else setDisplay(currentVal.toLocaleString());
      if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  }, [inView, value, duration]);

  return <span ref={ref}>{display}</span>;
}

export function Reframe() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-10%" });

  return (
    <section ref={ref} className="bg-foreground text-background py-32 relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden select-none opacity-[0.04]" aria-hidden="true">
        <span className="text-background leading-none whitespace-nowrap font-sans font-black" style={{ fontSize: "22vw", letterSpacing: "-0.05em" }}>ASSIGN</span>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 mb-24">
          <motion.div initial={{ opacity: 0, x: -60 }} animate={inView ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>
            <h2 className="text-6xl md:text-8xl leading-[0.88]" style={{ fontFamily: "'Instrument Serif', serif", fontStyle: "italic" }}>
              Rich kids<br />had tutors.
            </h2>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 60 }} animate={inView ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.15 }} className="flex items-end lg:justify-end">
            <p className="font-mono text-xl md:text-2xl text-background/60 uppercase tracking-widest max-w-md lg:text-right leading-relaxed">
              Everyone else<br />figured it out alone.
            </p>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 60 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.3 }} className="text-center">
          <span className="text-[15vw] leading-none tracking-tight" style={{ fontFamily: "'Instrument Serif', serif", fontStyle: "italic", color: "hsl(208 82% 57%)", display: "block" }}>
            Not anymore.
          </span>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 40 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.9, delay: 0.6 }}
          className="mt-24 pt-16 border-t-2 border-background/20 grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <div className="font-mono text-7xl md:text-8xl font-bold tracking-tighter text-background">
              <AnimatedCounter value={1_800_000_000} />
            </div>
            <p className="font-sans text-lg text-background/50 uppercase tracking-widest mt-3">Students worldwide</p>
          </div>
          <div>
            <div className="font-mono text-7xl md:text-8xl font-bold tracking-tighter" style={{ color: "hsl(208 82% 57%)" }}>1</div>
            <p className="font-sans text-lg text-background/50 uppercase tracking-widest mt-3">Tutor you deserve. Assign.</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

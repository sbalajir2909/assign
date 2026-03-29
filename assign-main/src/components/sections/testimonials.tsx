'use client'

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const testimonials = [
  { quote: "Assign didn't just give me the answers. It forced me to actually understand memory management in C. I passed the interview.", author: "Sarah J.", role: "SWE Intern · Google", initial: "SJ", feature: "Built", featureColor: "bg-blue-500" },
  { quote: "It's like having a professor who never gets tired of your 'stupid' questions. Trek mapped out my entire machine learning curriculum.", author: "Marcus T.", role: "CS Major · NYU", initial: "MT", feature: "Trek", featureColor: "bg-green-400" },
  { quote: "I used Recall to prep for my bar exam. The way it identified my weak spots in contract law was honestly terrifying. But brilliant.", author: "Elena R.", role: "Law Student · Columbia", initial: "ER", feature: "Recall", featureColor: "bg-red-400" },
];

export function Testimonials() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section id="testimonials" className="py-32 bg-muted border-t-2 border-foreground" ref={ref}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="h-px flex-1 bg-foreground/10" />
          <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">(04) Wall of love</span>
          <div className="h-px flex-1 bg-foreground/10" />
        </div>
        <div className="text-center mb-20">
          <h2 className="text-5xl md:text-7xl lg:text-8xl leading-[0.9]" style={{ fontFamily: "'Instrument Serif', serif", fontStyle: "italic" }}>
            Don't take our word for it.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, idx) => (
            <motion.div key={idx} initial={{ opacity: 0, y: 50 }} animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: idx * 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="border-2 border-foreground bg-background flex flex-col brutalist-shadow-hover">
              <div className="p-8 flex-1">
                <div className="flex items-center gap-2 mb-8">
                  <div className={`w-2.5 h-2.5 ${t.featureColor} border border-foreground`} />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">via {t.feature}</span>
                </div>
                <div className="font-serif text-6xl text-foreground/10 leading-none mb-2 select-none">"</div>
                <p className="font-sans text-lg leading-relaxed text-foreground">{t.quote}</p>
              </div>
              <div className="flex items-center gap-4 px-8 py-5 border-t-2 border-foreground bg-card mt-auto">
                <div className="w-10 h-10 bg-foreground text-background font-mono font-bold flex items-center justify-center text-sm border-2 border-foreground brutalist-shadow-sm flex-shrink-0">{t.initial}</div>
                <div>
                  <p className="font-sans font-semibold text-sm">{t.author}</p>
                  <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">{t.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

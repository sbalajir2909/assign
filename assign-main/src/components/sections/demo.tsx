'use client'

import { useState, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";

const conversation = [
  { role: "user", text: "I need to understand neural networks for my interview tomorrow 😭" },
  { role: "assign", text: "ok let's not panic lol. what do you already know about them?" },
  { role: "user", text: "like... they're inspired by the brain? and have hidden layers?" },
  { role: "assign", text: "yes! exactly. so think of neurons as little decision makers. if I ask you to identify a dog, your brain checks for 'fur', 'snout', 'barks'. A neural network does the exact same thing with data. starting to make sense?" },
  { role: "user", text: "oh wait — so the hidden layers are like... intermediate checks?" },
  { role: "assign", text: "💯 that's literally it. each layer finds patterns the previous one couldn't. you've got this." },
];

const AssignIcon = () => (
  <svg width="10" height="13" viewBox="0 0 24 30" fill="none">
    <path d="M12.8492 24.4945H24V29.962C21.4073 29.8743 18.7213 30.0785 16.1397 29.9643C13.2258 29.836 10.5209 28.6067 9.12138 26.2387C7.89229 24.1602 8.13447 21.3862 9.84793 19.5837C11.735 17.5994 14.3309 15.8416 16.2082 13.8537C19.9804 9.86039 15.2696 3.92914 9.85055 5.88817C8.31789 6.44251 6.26305 8.52334 6.26305 10.061V25.0229H0.00261097L0 10.3523C0.79504 1.90009 11.1462 -3.1849 19.0385 2.24729C23.735 5.47977 25.7161 12.2296 21.5888 16.5295C18.9993 19.2277 15.6103 21.6416 12.9465 24.3173L12.8492 24.4945Z" fill="currentColor" />
  </svg>
);

export function Demo() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-150px" });
  const [visibleMessages, setVisibleMessages] = useState(0);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!inView || visibleMessages >= conversation.length) return;
    const delays = [0, 1200, 2800, 4200, 6500, 8000];
    const timers = conversation.map((_, i) => setTimeout(() => setVisibleMessages(i + 1), delays[i]));
    return () => timers.forEach(clearTimeout);
  }, [inView]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [visibleMessages]);

  return (
    <section id="how-it-works" className="py-32 bg-primary relative overflow-hidden border-y-2 border-foreground" ref={ref}>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden select-none" aria-hidden="true">
        <span className="font-serif italic leading-none whitespace-nowrap text-foreground" style={{ fontSize: "28vw", opacity: 0.06 }}>talk to it</span>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-14">
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="h-px w-16 bg-foreground/30" />
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/60">(03) How it works</span>
            <div className="h-px w-16 bg-foreground/30" />
          </div>
          <h2 className="text-5xl md:text-7xl text-foreground mb-4" style={{ fontFamily: "'Instrument Serif', serif", fontStyle: "italic" }}>
            Talk to it.<br />Like a friend.
          </h2>
          <p className="font-mono text-sm text-foreground/60 uppercase tracking-widest">No robotic bullet points. Just back and forth until you get it.</p>
        </div>

        <div className="bg-background border-4 border-foreground brutalist-shadow-lg flex flex-col overflow-hidden" style={{ minHeight: "480px" }}>
          <div className="flex items-center gap-3 px-6 py-4 border-b-2 border-foreground bg-card">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 bg-red-400 border border-red-600" />
              <div className="w-3 h-3 bg-yellow-400 border border-yellow-600" />
              <div className="w-3 h-3 bg-green-400 border border-green-600" />
            </div>
            <div className="flex-1 text-center">
              <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Assign · Neural Networks</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-green-500 animate-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Live</span>
            </div>
          </div>

          <div ref={messagesContainerRef} className="flex-1 p-6 space-y-5 overflow-y-auto">
            {conversation.slice(0, visibleMessages).map((msg, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assign" && (
                  <div className="flex items-end gap-2 max-w-[80%]">
                    <div className="w-7 h-7 flex-shrink-0 bg-foreground text-background flex items-center justify-center border-2 border-foreground mb-0.5"><AssignIcon /></div>
                    <div className="bg-background border-2 border-foreground p-4 brutalist-shadow-sm">
                      <p className="font-sans text-sm sm:text-base leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                )}
                {msg.role === "user" && (
                  <div className="bg-foreground text-background border-2 border-foreground p-4 max-w-[80%] brutalist-shadow-sm">
                    <p className="font-sans text-sm sm:text-base leading-relaxed">{msg.text}</p>
                  </div>
                )}
              </motion.div>
            ))}

            {visibleMessages < conversation.length && visibleMessages > 0 && conversation[visibleMessages]?.role === "assign" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                <div className="w-7 h-7 flex-shrink-0 bg-foreground text-background flex items-center justify-center border-2 border-foreground"><AssignIcon /></div>
                <div className="bg-muted border-2 border-foreground px-4 py-3 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-1.5 h-1.5 bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-1.5 h-1.5 bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </motion.div>
            )}
          </div>

          <div className="border-t-2 border-foreground p-4 bg-card flex gap-3">
            <div className="flex-1 bg-background border-2 border-foreground px-4 py-3 font-mono text-sm text-muted-foreground flex items-center">
              {visibleMessages >= conversation.length
                ? <>so wait, what makes deep learning different then?<span className="w-2 h-4 bg-foreground ml-1 animate-pulse" /></>
                : "Ask anything..."}
            </div>
            <button className="bg-foreground text-background border-2 border-foreground px-6 py-3 font-mono text-xs font-bold uppercase tracking-widest hover:bg-primary hover:border-primary transition-colors">Send</button>
          </div>
        </div>
      </div>
    </section>
  );
}

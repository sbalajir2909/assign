'use client'

import { useState } from "react";
import { motion } from "framer-motion";

export function Cta() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) setSubmitted(true);
  };

  return (
    <section className="bg-foreground py-32 border-t-2 border-foreground relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.05]"
        style={{ backgroundImage: "linear-gradient(to right, #f1f0ee 1px, transparent 1px), linear-gradient(to bottom, #f1f0ee 1px, transparent 1px)", backgroundSize: "3rem 3rem" }}
        aria-hidden="true" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-background/40 mb-6">Early Access</p>
          <h2 className="leading-[0.85] text-background mb-10"
            style={{ fontFamily: "'Instrument Serif', serif", fontStyle: "italic", fontSize: "clamp(3.5rem, 12vw, 11rem)" }}>
            Your tutor<br />is waiting.
          </h2>
          <p className="font-mono text-lg text-background/50 uppercase tracking-widest mb-16">
            Join the waitlist. Be first. Learn different.
          </p>
        </motion.div>

        {!submitted ? (
          <motion.form className="max-w-lg mx-auto flex flex-col sm:flex-row gap-0 border-2 border-background brutalist-shadow-white-lg"
            onSubmit={handleSubmit} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }}>
            <input id="waitlist" type="email" placeholder="your@email.com" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="flex-1 bg-foreground text-background border-0 border-r-2 border-background px-6 py-4 font-mono text-sm placeholder:text-background/30 focus:outline-none focus:bg-background/5" />
            <button type="submit" className="bg-background text-foreground px-8 py-4 font-mono font-bold text-sm uppercase tracking-widest hover:bg-primary hover:text-foreground transition-colors whitespace-nowrap">
              Get Access →
            </button>
          </motion.form>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="max-w-lg mx-auto border-2 border-background brutalist-shadow-white-lg px-8 py-6 bg-primary">
            <p className="font-mono font-bold text-foreground uppercase tracking-widest">🎉 You're on the list. We'll be in touch.</p>
          </motion.div>
        )}

        <p className="font-mono text-xs text-background/30 mt-8 uppercase tracking-widest">No credit card. No BS. Just learning.</p>

        <div className="flex flex-wrap justify-center gap-4 mt-16 pt-12 border-t border-background/10">
          {["Built · for coders", "Spark · for questions", "Trek · for learners", "Recall · for exams"].map((item) => (
            <div key={item} className="font-mono text-xs text-background/40 uppercase tracking-widest border border-background/10 px-4 py-2">{item}</div>
          ))}
        </div>
      </div>
    </section>
  );
}

'use client'

import { useState } from "react";
import Link from "next/link";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { Menu, X } from "lucide-react";

const AssignLogo = () => (
  <svg width="22" height="27" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" className="group-hover:scale-110 transition-transform duration-200">
    <path d="M12.8492 24.4945H24V29.962C21.4073 29.8743 18.7213 30.0785 16.1397 29.9643C13.2258 29.836 10.5209 28.6067 9.12138 26.2387C7.89229 24.1602 8.13447 21.3862 9.84793 19.5837C11.735 17.5994 14.3309 15.8416 16.2082 13.8537C19.9804 9.86039 15.2696 3.92914 9.85055 5.88817C8.31789 6.44251 6.26305 8.52334 6.26305 10.061V25.0229H0.00261097L0 10.3523C0.79504 1.90009 11.1462 -3.1849 19.0385 2.24729C23.735 5.47977 25.7161 12.2296 21.5888 16.5295C18.9993 19.2277 15.6103 21.6416 12.9465 24.3173L12.8492 24.4945Z" fill="currentColor" />
  </svg>
);

export function Navigation({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? 0;
    setHidden(latest > previous && latest > 200);
    setScrolled(latest > 50);
  });

  const navLinks = [
    { href: "#features", label: "Features" },
    { href: "#how-it-works", label: "How it works" },
    { href: "#testimonials", label: "Wall of Love" },
  ];

  return (
    <motion.header
      variants={{ visible: { y: 0 }, hidden: { y: "-100%" } }}
      animate={hidden ? "hidden" : "visible"}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? "bg-background/95 backdrop-blur-md border-b-2 border-foreground" : "bg-transparent"}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[70px]">
          <Link href="/" className="flex items-center gap-2.5 cursor-pointer group">
            <AssignLogo />
            <span className="font-mono font-bold text-lg tracking-tight">ASSIGN</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href}
                className="font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors duration-200 relative group">
                {link.label}
                <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-primary transition-all duration-200 group-hover:w-full" />
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <Link href="/dashboard"
                className="hidden sm:flex items-center font-mono text-xs font-bold uppercase tracking-widest bg-foreground text-background px-5 py-2.5 border-2 border-foreground brutalist-shadow hover:bg-primary hover:border-primary transition-colors duration-150">
                Go to App →
              </Link>
            ) : (
              <Link href="/login"
                className="hidden sm:flex items-center font-mono text-xs font-bold uppercase tracking-widest bg-foreground text-background px-5 py-2.5 border-2 border-foreground brutalist-shadow hover:bg-primary hover:border-primary transition-colors duration-150">
                Get Early Access →
              </Link>
            )}
            <button className="md:hidden text-foreground p-1" onClick={() => setMobileOpen(!mobileOpen)}>
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-background border-t-2 border-foreground">
          <div className="px-4 py-6 flex flex-col gap-4">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setMobileOpen(false)}
                className="font-mono text-sm uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
                {link.label}
              </a>
            ))}
            {isLoggedIn ? (
              <Link href="/dashboard" className="font-mono text-xs font-bold uppercase tracking-widest bg-foreground text-background px-5 py-3 border-2 border-foreground text-center mt-2">
                Go to App →
              </Link>
            ) : (
              <Link href="/login" onClick={() => setMobileOpen(false)}
                className="font-mono text-xs font-bold uppercase tracking-widest bg-foreground text-background px-5 py-3 border-2 border-foreground text-center mt-2">
                Get Early Access →
              </Link>
            )}
          </div>
        </div>
      )}
    </motion.header>
  );
}

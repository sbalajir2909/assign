'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const AssignLogo = () => (
  <svg width="20" height="24" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12.8492 24.4945H24V29.962C21.4073 29.8743 18.7213 30.0785 16.1397 29.9643C13.2258 29.836 10.5209 28.6067 9.12138 26.2387C7.89229 24.1602 8.13447 21.3862 9.84793 19.5837C11.735 17.5994 14.3309 15.8416 16.2082 13.8537C19.9804 9.86039 15.2696 3.92914 9.85055 5.88817C8.31789 6.44251 6.26305 8.52334 6.26305 10.061V25.0229H0.00261097L0 10.3523C0.79504 1.90009 11.1462 -3.1849 19.0385 2.24729C23.735 5.47977 25.7161 12.2296 21.5888 16.5295C18.9993 19.2277 15.6103 21.6416 12.9465 24.3173L12.8492 24.4945Z"
      fill="currentColor"
    />
  </svg>
)

const features = [
  { href: '/build', label: 'Build' },
  { href: '/spark', label: 'Spark' },
  { href: '/trek', label: 'Trek' },
  { href: '/recall', label: 'Recall' },
]

export function BuildNav() {
  const pathname = usePathname()

  return (
    <header className="h-[64px] bg-background border-b-2 border-foreground flex items-center px-6 flex-shrink-0">
      <div className="flex items-center gap-8 w-full">
        <Link href="/" className="flex items-center gap-2 group cursor-pointer">
          <AssignLogo />
          <span className="font-mono font-bold text-base tracking-tight">Assign</span>
        </Link>

        <nav className="flex items-center gap-1">
          {features.map((feature) => {
            const isActive = pathname === feature.href || pathname?.startsWith(`${feature.href}/`)
            return (
              <Link
                key={feature.href}
                href={feature.href}
                className={`font-sans text-sm px-4 py-1.5 transition-colors duration-150 ${
                  isActive
                    ? 'bg-foreground text-background font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {feature.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto">
          <Link
            href="/"
            className="font-sans text-sm font-semibold bg-foreground text-background px-4 py-2 border-2 border-foreground brutalist-shadow hover:bg-primary hover:border-primary transition-colors duration-150"
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  )
}

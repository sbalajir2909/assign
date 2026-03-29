import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Assign — Your AI Tutor",
  description: "The AI tutor that actually teaches you. Not just gives you answers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

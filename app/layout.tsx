import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jobify Agent",
  description: "Autonomous job application dashboard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="border-b border-border px-6 py-4 flex items-center gap-8 text-sm sticky top-0 z-10 backdrop-blur-md bg-ink/85">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-block w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
            Jobify Agent
          </Link>
          <div className="flex gap-6">
            <Link href="/" className="text-text-muted hover:text-accent transition-colors">Overview</Link>
            <Link href="/applications" className="text-text-muted hover:text-accent transition-colors">Applications</Link>
            <Link href="/resumes" className="text-text-muted hover:text-accent transition-colors">Resumes</Link>
            <Link href="/profile" className="text-text-muted hover:text-accent transition-colors">Profile</Link>
          </div>
        </nav>
        <main className="flex-1 px-6 py-10 max-w-6xl w-full mx-auto">{children}</main>
      </body>
    </html>
  );
}

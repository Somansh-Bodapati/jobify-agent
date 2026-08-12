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
      <body className="min-h-full flex flex-col bg-neutral-950 text-neutral-100">
        <nav className="border-b border-neutral-800 px-6 py-3 flex gap-6 text-sm">
          <Link href="/" className="font-semibold">Jobify Agent</Link>
          <Link href="/applications" className="text-neutral-400 hover:text-neutral-100">Applications</Link>
          <Link href="/resumes" className="text-neutral-400 hover:text-neutral-100">Resumes</Link>
          <Link href="/profile" className="text-neutral-400 hover:text-neutral-100">Profile</Link>
        </nav>
        <main className="flex-1 px-6 py-8">{children}</main>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Catechism Compass", template: "%s · Catechism Compass" },
  description:
    "Search the Catechism of the Catholic Church and the Bible for what the Church teaches on a moral or doctrinal topic. A reference tool, not an answer engine.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0f" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Runs before first paint so the stored theme never flashes.
const themeScript = `(function(){try{var t=localStorage.getItem("cc-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <header className="border-b hairline">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="font-serif text-lg tracking-tight text-ink hover:text-accent-2 active:opacity-75">
              Catechism <span className="italic text-ink-2">Compass</span>
            </Link>
            <nav className="flex items-center gap-5 text-sm text-ink-2">
              <Link href="/topics" className="hover:text-ink active:opacity-75">
                Topics
              </Link>
              <Link href="/about" className="hover:text-ink active:opacity-75">
                About
              </Link>
              <ThemeToggle />
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 sm:px-6">{children}</main>

        <footer className="border-t hairline">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 text-xs leading-relaxed text-ink-3 sm:px-6">
            <p className="max-w-3xl">
              Catechism Compass is a reference aid, not a substitute for a priest, a spiritual director, or the Magisterium of the
              Church. Results are the text of the <em>Catechism of the Catholic Church</em> (© Libreria Editrice Vaticana / USCCB) and the
              Douay-Rheims Bible (public domain); nothing is generated. Search runs locally on this server.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

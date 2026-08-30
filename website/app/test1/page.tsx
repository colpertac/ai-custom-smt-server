import type { Metadata } from "next"

import {
  LabViewport,
  StubButton,
  StubLink,
  VariantSwitcher,
} from "@/components/design-lab/kit"

export const metadata: Metadata = {
  title: "Lab · Stage",
}

/** Variant 1 — closest to the live gold/slate stage. */
export default function Test1Page() {
  return (
    <LabViewport className="site-atmosphere">
      <VariantSwitcher active="1" />
      <div className="mx-auto flex min-h-[calc(100svh-2.5rem)] max-w-[980px] flex-col px-3 py-4 sm:px-4 sm:py-6">
        <header className="site-panel border-b-0 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-heading text-[0.7rem] font-semibold tracking-[0.35em] text-gold-dim uppercase">
                Shin Megami Tensei
              </p>
              <p className="font-heading mt-1 text-3xl font-bold tracking-[0.18em] uppercase sm:text-4xl">
                Imagine
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Private server · account portal
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-3 sm:items-end">
              <nav className="flex flex-wrap gap-x-1 border border-border bg-muted/60 px-2 py-1 text-[0.8rem] uppercase tracking-[0.12em]">
                <StubLink>News</StubLink>
                <span className="text-border">|</span>
                <StubLink>Download</StubLink>
                <span className="text-border">|</span>
                <StubLink>Status</StubLink>
              </nav>
              <div className="flex gap-2">
                <StubButton variant="outline">Log in</StubButton>
                <StubButton>Register</StubButton>
              </div>
            </div>
          </div>
        </header>
        <div className="gold-rule" />
        <main className="site-panel flex flex-1 flex-col justify-center px-4 py-10 sm:px-8">
          <p className="font-heading text-[0.7rem] font-semibold tracking-[0.4em] text-gold-dim uppercase">
            Welcome to the Terminal
          </p>
          <h1 className="font-heading mt-4 text-4xl font-bold tracking-[0.14em] uppercase sm:text-5xl md:text-6xl">
            Imagine
          </h1>
          <div className="gold-rule mt-5 max-w-md" />
          <p className="mt-5 max-w-lg text-base text-muted-foreground sm:text-lg">
            A private Shin Megami Tensei: IMAGINE realm. Register an account, set
            up the client, and return to Tokyo.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <StubButton className="min-w-36 px-4 py-2.5 text-sm">
              Create account
            </StubButton>
            <StubButton variant="outline" className="min-w-36 px-4 py-2.5 text-sm">
              Download
            </StubButton>
            <StubButton variant="ghost" className="px-4 py-2.5 text-sm">
              Sign in
            </StubButton>
          </div>
        </main>
        <footer className="mt-3 border border-border bg-muted/40 px-4 py-3 text-center text-[0.7rem] text-muted-foreground">
          Unofficial private server fan project. Stub layout for comparison.
        </footer>
      </div>
    </LabViewport>
  )
}

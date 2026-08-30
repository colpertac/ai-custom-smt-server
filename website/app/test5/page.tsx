import type { Metadata } from "next"
import Link from "next/link"

import {
  LabViewport,
  StubButton,
  VariantSwitcher,
} from "@/components/design-lab/kit"

export const metadata: Metadata = {
  title: "Lab · COMP terminal",
}

/** Variant 5 — monospace COMP / terminal console. */
export default function Test5Page() {
  return (
    <LabViewport className="bg-[#020403] font-mono">
      <VariantSwitcher active="5" />
      <div
        className="min-h-[calc(100svh-2.5rem)]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgb(0 0 0 / 0.25) 2px, rgb(0 0 0 / 0.25) 3px)",
        }}
      >
        <div className="mx-auto max-w-3xl px-4 py-8">
          <pre className="overflow-x-auto text-[0.65rem] leading-tight text-[#3d5c3a] sm:text-xs">
{`╔══════════════════════════════════════════════════════════╗
║  COMP NETWORK  //  PRIVATE NODE  //  AUTH GATEWAY        ║
╚══════════════════════════════════════════════════════════╝`}
          </pre>

          <div className="mt-6 border border-[#1f3d1c] bg-[#061008]/90 p-4 shadow-[0_0_40px_rgb(40_80_40_/_0.15)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1f3d1c] pb-3">
              <p className="text-xs tracking-widest text-[#6dc256]">
                SESSION: GUEST
              </p>
              <p className="text-[0.65rem] text-[#3d5c3a]">
                ping ok · lobby: listening
              </p>
            </div>

            <h1 className="mt-5 text-2xl tracking-[0.2em] text-[#9ae89a] uppercase">
              Imagine
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-[#6a9a68]">
              &gt; unauthorized access to this private COMP is prohibited
              <br />
              &gt; create credentials to continue
            </p>

            <div className="mt-6 grid gap-2 text-xs text-[#8fbf8c] sm:grid-cols-2">
              <label className="block border border-[#1f3d1c] bg-black/40 p-3">
                <span className="text-[0.65rem] text-[#3d5c3a]">USER ID</span>
                <input
                  disabled
                  placeholder="________"
                  className="mt-1 w-full cursor-not-allowed bg-transparent text-[#9ae89a] outline-none placeholder:text-[#2a4a28]"
                />
              </label>
              <label className="block border border-[#1f3d1c] bg-black/40 p-3">
                <span className="text-[0.65rem] text-[#3d5c3a]">PASSCODE</span>
                <input
                  disabled
                  type="password"
                  placeholder="********"
                  className="mt-1 w-full cursor-not-allowed bg-transparent text-[#9ae89a] outline-none placeholder:text-[#2a4a28]"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <StubButton className="border-[#3d5c3a] bg-[#1a3a18] text-[#9ae89a] hover:bg-[#2a5a28]">
                Authenticate
              </StubButton>
              <StubButton
                variant="outline"
                className="border-[#1f3d1c] text-[#6a9a68] hover:border-[#3d5c3a]"
              >
                New account
              </StubButton>
              <StubButton
                variant="ghost"
                className="text-[#3d5c3a] hover:text-[#6dc256]"
              >
                Download payload
              </StubButton>
            </div>

            <div className="mt-8 border-t border-[#1f3d1c] pt-4">
              <p className="text-[0.65rem] tracking-widest text-[#3d5c3a]">
                SYSTEM LOG
              </p>
              <ul className="mt-2 space-y-1 text-[0.7rem] text-[#4a7a48]">
                <li>00:00:01  channel probe … OK</li>
                <li>00:00:01  updater :8765 … OK</li>
                <li>00:00:02  world (internal) … HIDDEN</li>
                <li className="text-[#6dc256]">
                  00:00:03  awaiting operator input_
                </li>
              </ul>
            </div>
          </div>

          <p className="mt-6 text-center text-[0.65rem] text-[#2a4a28]">
            Terminal variant — green phosphor, stub forms only.{" "}
            <Link
              href="/test"
              className="text-[#3d5c3a] no-underline hover:text-[#6dc256]"
            >
              Back to lab index
            </Link>
          </p>
        </div>
      </div>
    </LabViewport>
  )
}

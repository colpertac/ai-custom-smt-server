import type { Metadata } from "next"

import { getPublicUpdaterUrl, getSiteUrl } from "@/lib/env"

export const metadata: Metadata = {
  title: "Download",
}

export default function DownloadPage() {
  const site = getSiteUrl()
  const updater = getPublicUpdaterUrl()
  const hostHint = site
    ? new URL(site).hostname
    : updater
      ? new URL(updater).hostname
      : "YOUR_HOST"

  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
        Download
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-4 text-sm text-muted-foreground">
        Point the stock COMP updater and VersionData at this realm. Full
        checklist: guides/client-host-config.md in the repo.
      </p>

      <div className="mt-8 space-y-6 text-sm">
        <div className="border border-border bg-muted/40 p-4">
          <h2 className="font-heading text-lg font-semibold tracking-wide text-gold-dim">
            Updater
          </h2>
          <p className="mt-2 text-muted-foreground">
            In <code className="text-foreground">ImagineUpdate-user.dat</code>:
          </p>
          <pre className="mt-3 overflow-x-auto border border-border bg-background/80 p-3 font-mono text-xs">
            {`[Setting]
BaseURL1 = ${updater ?? `http://${hostHint}:8765`}/files
Information = ${updater ?? `http://${hostHint}:8765`}/`}
          </pre>
          {updater ? (
            <p className="mt-2">
              <a
                className="underline underline-offset-2 hover:text-gold-dim"
                href={`${updater}/files/hashlist.dat`}
              >
                Open hashlist.dat
              </a>
            </p>
          ) : (
            <p className="mt-2 text-muted-foreground">
              Set <code className="text-foreground">PUBLIC_UPDATER_URL</code> on
              the website container to show live links.
            </p>
          )}
        </div>

        <div className="border border-border bg-muted/40 p-4">
          <h2 className="font-heading text-lg font-semibold tracking-wide text-gold-dim">
            Game login
          </h2>
          <p className="mt-2 text-muted-foreground">
            In <code className="text-foreground">VersionData-user.txt</code> (or
            VersionData.txt):
          </p>
          <pre className="mt-3 overflow-x-auto border border-border bg-background/80 p-3 font-mono text-xs">
            {`[versions]
title = Private SMT
server = ${hostHint}:10666
tag = local

[local]
webaccess.sdat`}
          </pre>
        </div>

        <div className="border border-[#911] bg-background/60 p-4">
          <h2 className="font-heading text-lg font-semibold tracking-wide text-gold-dim">
            Client build
          </h2>
          <p className="mt-2 text-muted-foreground">
            Use a Reimagine / COMP client tree. There is no public installer
            tarball on this portal yet — ship the client privately, then run
            ImagineUpdate.exe against the BaseURL above.
          </p>
        </div>
      </div>
    </section>
  )
}

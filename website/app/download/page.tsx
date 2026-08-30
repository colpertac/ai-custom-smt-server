import type { Metadata } from "next"

import { getClientDownloadSettings } from "@/lib/site-settings-store"

export const metadata: Metadata = {
  title: "Download",
}

export default function DownloadPage() {
  const { url, label, notes } = getClientDownloadSettings()
  const hasClient = Boolean(url)

  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
        Download
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-4 text-sm text-muted-foreground">
        Get the game client for this realm. Unzip and play — connection settings
        are already baked in by the server owner.
      </p>

      <div className="mt-8 space-y-6 text-sm">
        <div className="border border-border bg-muted/40 p-4">
          <h2 className="font-heading text-lg font-semibold tracking-wide text-gold-dim">
            Client
          </h2>
          {hasClient ? (
            <>
              <p className="mt-3">
                <a
                  className="inline-flex border border-[#cc9d00] bg-[#d3b800] px-4 py-2 text-xs font-semibold tracking-[0.12em] text-[#0a0c10] uppercase transition-colors hover:bg-[#f0d24a]"
                  href={url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {label || "Download client"}
                </a>
              </p>
              {notes ? (
                <p className="mt-3 text-muted-foreground">{notes}</p>
              ) : (
                <p className="mt-3 text-muted-foreground">
                  External host (MediaFire, Drive, etc.). Download, unzip, then
                  run the updater or client from that folder.
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-muted-foreground">
              No public client link yet. The server owner sets it under Admin →
              Download after uploading their prepared client zip.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

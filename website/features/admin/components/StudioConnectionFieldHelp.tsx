"use client"

import { useState } from "react"
import { CircleHelp } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type FieldKey = "studioUrl" | "previewUrl" | "studioToken" | "workerToken"

const EXAMPLE = {
  website: "192.168.0.40",
  wine: "192.168.0.230",
} as const

const FIELDS: Record<
  FieldKey,
  { title: string; body: string; websiteSets: string; wineEnv: string }
> = {
  studioUrl: {
    title: "Studio URL",
    body: "Channel studio HTTP — dress/health. This website must reach it. Never 127.0.0.1 here unless channel runs on this same PC.",
    websiteSets: `http://${EXAMPLE.wine}:14700`,
    wineEnv: `PORTRAIT_STUDIO_URL=http://127.0.0.1:14700  (channel is on the Wine box)`,
  },
  previewUrl: {
    title: "Preview agent URL",
    body: "Wine-host agent started by ./studio up (snaps, clients, drone). Always the Wine PC, port 14701. Never 127.0.0.1 on the website unless Wine runs here.",
    websiteSets: `http://${EXAMPLE.wine}:14701`,
    wineEnv: "no URL to set — agent listens on this box (:14701)",
  },
  studioToken: {
    title: "Studio token",
    body: "Shared secret for website → channel (header X-Studio-Token). Same value as channel.xml StudioToken and the Wine box PORTRAIT_STUDIO_TOKEN. Saving here also writes the channel draft.",
    websiteSets: "same string on both machines (e.g. a long random token)",
    wineEnv: "PORTRAIT_STUDIO_TOKEN=<same string>",
  },
  workerToken: {
    title: "Worker token",
    body: "Auth for the Wine agent and portrait queue (header X-Portrait-Worker-Token). Optional — leave blank to reuse the studio token. If you set one, it must match Wine PORTRAIT_WORKER_TOKEN.",
    websiteSets: "same as Wine, or leave blank to use studio token",
    wineEnv: "PORTRAIT_WORKER_TOKEN=<same>, or omit to fall back to studio token",
  },
}

function ExampleBlock({ field }: { field: FieldKey }) {
  const meta = FIELDS[field]
  return (
    <div className="space-y-2 text-xs/relaxed">
      <p>{meta.body}</p>
      <div className="border border-border/70 bg-background/50 p-2 space-y-1.5">
        <p className="text-[11px] font-medium text-foreground">
          Example — website {EXAMPLE.website}, Wine box {EXAMPLE.wine}
        </p>
        <p className="font-mono text-[11px] text-muted-foreground">
          On this Admin page set {meta.title} to:
        </p>
        <p className="font-mono text-[11px] text-foreground break-all">
          {meta.websiteSets}
        </p>
        <p className="font-mono text-[11px] text-muted-foreground">
          On Wine <span className="text-foreground">deploy-studio/.env</span>:
        </p>
        <p className="font-mono text-[11px] text-foreground break-all">
          {meta.wineEnv}
        </p>
      </div>
      {field === "studioUrl" ? (
        <p className="text-[11px] text-muted-foreground">
          If channel HTTP is on the website/game host instead of Wine, flip it:
          Admin Studio URL ={" "}
          <span className="font-mono text-foreground">
            http://127.0.0.1:14700
          </span>
          , Wine{" "}
          <span className="font-mono text-foreground">
            PORTRAIT_STUDIO_URL=http://{EXAMPLE.website}:14700
          </span>
          .
        </p>
      ) : null}
      {field === "previewUrl" ? (
        <p className="text-[11px] text-muted-foreground">
          Wine queue URL is the other direction:{" "}
          <span className="font-mono text-foreground">
            PORTRAIT_QUEUE_URL=http://{EXAMPLE.website}:3500
          </span>
          .
        </p>
      ) : null}
    </div>
  )
}

export function StudioConnectionFieldHelp({
  field,
  label,
}: {
  field: FieldKey
  label: string
}) {
  const [open, setOpen] = useState(false)
  const meta = FIELDS[field]

  return (
    <>
      <button
        type="button"
        className="inline-flex size-4 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={`Help: ${label}`}
        onClick={() => setOpen(true)}
      >
        <CircleHelp className="size-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{meta.title}</DialogTitle>
            <DialogDescription>
              What to put in this field vs the Wine box{" "}
              <span className="font-mono">.env</span>.
            </DialogDescription>
          </DialogHeader>
          <ExampleBlock field={field} />
        </DialogContent>
      </Dialog>
    </>
  )
}

export function StudioConnectionOverviewHelp() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="text-muted-foreground"
        aria-label="Connection field help"
        onClick={() => setOpen(true)}
      >
        <CircleHelp className="size-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Studio connection fields</DialogTitle>
            <DialogDescription>
              Website ({EXAMPLE.website}) talks to Wine ({EXAMPLE.wine}). Each
              URL is “from this website, can I reach that service?”
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-xs/relaxed">
            <div className="border border-border/70 bg-background/50 p-2 font-mono text-[11px] space-y-1">
              <p>
                Studio URL →{" "}
                <span className="text-foreground">
                  http://{EXAMPLE.wine}:14700
                </span>
              </p>
              <p>
                Preview agent URL →{" "}
                <span className="text-foreground">
                  http://{EXAMPLE.wine}:14701
                </span>
              </p>
              <p>
                Studio token + worker token → same strings as Wine{" "}
                <span className="text-foreground">.env</span>
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              On the Wine box,{" "}
              <span className="font-mono text-foreground">
                PORTRAIT_STUDIO_URL=http://127.0.0.1:14700
              </span>{" "}
              (local channel) and{" "}
              <span className="font-mono text-foreground">
                PORTRAIT_QUEUE_URL=http://{EXAMPLE.website}:3500
              </span>{" "}
              (this website). Click the ? on a field for that field only.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

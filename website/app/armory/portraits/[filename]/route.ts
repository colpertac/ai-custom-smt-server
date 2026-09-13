import { readFile } from "node:fs/promises"

import {
  portraitContentType,
  portraitFilePath,
} from "@/lib/armory-portrait"

export const dynamic = "force-dynamic"

type Params = { params: Promise<{ filename: string }> }

/**
 * Next standalone only serves `public/` files that existed at image build.
 * Studio ingest writes PNGs later onto the bind mount — serve them here.
 */
async function servePortrait(filename: string): Promise<Response> {
  const full = portraitFilePath(filename)
  if (!full) {
    return new Response("Not found", { status: 404 })
  }
  try {
    const buf = await readFile(full)
    return new Response(buf, {
      headers: {
        "Content-Type": portraitContentType(filename),
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}

export async function GET(_request: Request, { params }: Params) {
  const { filename } = await params
  return servePortrait(filename ?? "")
}

export async function HEAD(_request: Request, { params }: Params) {
  const { filename } = await params
  const res = await servePortrait(filename ?? "")
  return new Response(null, { status: res.status, headers: res.headers })
}

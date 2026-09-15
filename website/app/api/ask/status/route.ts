import { isAskLlmConfigured } from "@/lib/ask-atlas-settings-store"
import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({ llmConfigured: isAskLlmConfigured() })
}

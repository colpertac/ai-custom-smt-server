import { NextResponse } from "next/server"

import { isStoreCartEnabled } from "@/lib/store-prices-store"

/** Public flag for header / wiki buy UI. */
export async function GET() {
  return NextResponse.json({
    enabled: isStoreCartEnabled(),
  })
}

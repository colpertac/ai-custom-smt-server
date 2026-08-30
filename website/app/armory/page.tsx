import type { Metadata } from "next"

import {
  ArmoryCharacterListPanel,
  armoryBrowsePageHref,
} from "@/features/armory/components/ArmorySearchResults"
import { ArmorySearch } from "@/features/armory/components/ArmorySearch"
import {
  ARMORY_SEARCH_PAGE_SIZE,
  listArmoryCharacters,
  WorldDbMissingError,
} from "@/lib/armory"

export const metadata: Metadata = {
  title: "Armory",
}

export const dynamic = "force-dynamic"

type Props = {
  searchParams: Promise<{ page?: string }>
}

function parseBrowsePage(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "1", 10)
  if (!Number.isFinite(parsed) || parsed < 1) return 0
  return parsed - 1
}

export default async function ArmoryPage({ searchParams }: Props) {
  const page = parseBrowsePage((await searchParams).page)

  let list = null
  let dbError: string | null = null
  try {
    list = listArmoryCharacters({
      limit: ARMORY_SEARCH_PAGE_SIZE,
      offset: page * ARMORY_SEARCH_PAGE_SIZE,
    })
  } catch (error) {
    if (error instanceof WorldDbMissingError) {
      dbError = error.message
    } else {
      throw error
    }
  }

  return (
    <section className="site-atmosphere mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
        Character armory
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-4 max-w-xl text-sm text-muted-foreground">
        Browse all characters or search by name. Shows level, stats, clan, and
        equipped gear. Account login names and bags stay private.
      </p>
      <div className="mt-8 border-2 border-border bg-card/60 p-4">
        <ArmorySearch autoFocus />
      </div>

      <div className="mt-8">
        {dbError ? (
          <p className="text-sm text-[#ff9b9b]">{dbError}</p>
        ) : list ? (
          <ArmoryCharacterListPanel
            items={list.items}
            total={list.total}
            page={page}
            pageHref={armoryBrowsePageHref}
            summary={`${list.total.toLocaleString()} character${list.total === 1 ? "" : "s"}`}
            emptyMessage="No characters in the world database yet."
          />
        ) : null}
      </div>
    </section>
  )
}

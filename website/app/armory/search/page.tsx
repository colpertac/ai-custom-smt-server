import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ArmorySearch } from "@/features/armory/components/ArmorySearch"
import { ArmorySearchResults } from "@/features/armory/components/ArmorySearchResults"
import {
  ARMORY_SEARCH_PAGE_SIZE,
  isValidCharacterName,
  searchArmoryCharacters,
  WorldDbMissingError,
} from "@/lib/armory"

export const dynamic = "force-dynamic"

type Props = {
  searchParams: Promise<{ q?: string; page?: string }>
}

function parseSearchPage(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "1", 10)
  if (!Number.isFinite(parsed) || parsed < 1) return 0
  return parsed - 1
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = (await searchParams).q?.trim()
  return { title: q ? `Search: ${q}` : "Search" }
}

export default async function ArmorySearchPage({ searchParams }: Props) {
  const sp = await searchParams
  const query = sp.q?.trim() ?? ""
  const page = parseSearchPage(sp.page)

  if (query && !isValidCharacterName(query)) notFound()

  let searchResult = null
  let dbError: string | null = null

  if (query) {
    try {
      searchResult = searchArmoryCharacters(query, {
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
  }

  return (
    <section className="site-atmosphere mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 border-2 border-border bg-card/60 p-4">
        <ArmorySearch initialName={query} />
      </div>

      <p className="mb-4 text-xs">
        <Link href="/armory" className="hover:text-gold-dim">
          ← Armory search
        </Link>
      </p>

      {!query ? (
        <>
          <h1 className="font-heading text-2xl font-semibold tracking-[0.1em] text-[#e8ecf4] uppercase">
            Character search
          </h1>
          <div className="gold-rule mt-3 max-w-xs" />
          <div className="mt-6 border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
            Enter a full or partial character name above.
          </div>
        </>
      ) : (
        <>
          <h1 className="font-heading text-2xl font-semibold tracking-[0.1em] text-[#e8ecf4] uppercase">
            Search: {query}
          </h1>
          <div className="gold-rule mt-3 max-w-xs" />

          <div className="mt-6">
            {dbError ? (
              <p className="text-sm text-[#ff9b9b]">{dbError}</p>
            ) : searchResult ? (
              <ArmorySearchResults result={searchResult} page={page} />
            ) : null}
          </div>
        </>
      )}
    </section>
  )
}

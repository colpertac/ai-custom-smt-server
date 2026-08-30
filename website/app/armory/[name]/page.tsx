import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ArmoryProfileView } from "@/features/armory/components/ArmoryProfileView"
import { ArmorySearch } from "@/features/armory/components/ArmorySearch"
import { ArmoryTabs } from "@/features/armory/components/ArmoryTabs"
import {
  isValidCharacterName,
  loadArmoryProfile,
  WorldDbMissingError,
} from "@/lib/armory"

type Props = { params: Promise<{ name: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const name = decodeURIComponent((await params).name)
  return { title: name }
}

export default async function ArmoryCharacterPage({ params }: Props) {
  const name = decodeURIComponent((await params).name).trim()
  if (!isValidCharacterName(name)) notFound()

  let profile
  let dbError: string | null = null
  try {
    profile = loadArmoryProfile(name)
  } catch (error) {
    if (error instanceof WorldDbMissingError) {
      dbError = error.message
      profile = null
    } else {
      throw error
    }
  }

  if (!dbError && !profile) notFound()

  return (
    <section className="site-atmosphere mx-auto max-w-5xl px-4 py-8">
      <p className="mb-4 text-xs">
        <Link href="/armory" className="hover:text-gold-dim">
          ← Armory search
        </Link>
      </p>

      <div className="mb-4">
        <ArmoryTabs name={name} active="character" />
      </div>

      {dbError ? (
        <p className="text-sm text-[#ff9b9b]">{dbError}</p>
      ) : profile ? (
        <ArmoryProfileView profile={profile} />
      ) : null}

      <div className="mt-10 border-t border-border pt-6">
        <p className="mb-3 text-xs tracking-wide text-muted-foreground uppercase">
          Search another
        </p>
        <ArmorySearch initialName="" />
      </div>
    </section>
  )
}

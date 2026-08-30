import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ArmoryDemonsView } from "@/features/armory/components/ArmoryDemonsView"
import { ArmorySearch } from "@/features/armory/components/ArmorySearch"
import { ArmoryTabs } from "@/features/armory/components/ArmoryTabs"
import {
  loadArmoryDemons,
  WorldDbMissingError,
} from "@/lib/armory-demons"
import { isValidCharacterName } from "@/lib/armory"

type Props = { params: Promise<{ name: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const name = decodeURIComponent((await params).name)
  return { title: `${name} · Demons` }
}

export default async function ArmoryDemonsPage({ params }: Props) {
  const name = decodeURIComponent((await params).name).trim()
  if (!isValidCharacterName(name)) notFound()

  let data
  let dbError: string | null = null
  try {
    data = loadArmoryDemons(name)
  } catch (error) {
    if (error instanceof WorldDbMissingError) {
      dbError = error.message
      data = null
    } else {
      throw error
    }
  }

  if (!dbError && !data) notFound()

  return (
    <section className="site-atmosphere mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 border-2 border-border bg-card/60 p-4">
        <ArmorySearch />
      </div>

      <p className="mb-4 text-xs">
        <Link href="/armory" className="hover:text-gold-dim">
          ← Armory search
        </Link>
      </p>

      <h1 className="font-heading text-3xl font-semibold tracking-[0.1em] text-[#e8ecf4] uppercase">
        {name}
      </h1>
      <div className="mt-4">
        <ArmoryTabs name={name} active="demons" />
      </div>

      <div className="mt-6">
        {dbError ? (
          <p className="text-sm text-[#ff9b9b]">{dbError}</p>
        ) : data ? (
          <ArmoryDemonsView data={data} />
        ) : null}
      </div>
    </section>
  )
}

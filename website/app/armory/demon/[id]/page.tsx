import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ArmoryDemonProfileView } from "@/features/armory/components/ArmoryDemonProfileView"
import { ArmorySearch } from "@/features/armory/components/ArmorySearch"
import {
  isValidDemonId,
  loadArmoryDemonDetail,
  WorldDbMissingError,
} from "@/lib/armory-demons"

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = decodeURIComponent((await params).id)
  try {
    const demon = isValidDemonId(id) ? loadArmoryDemonDetail(id) : null
    return { title: demon?.name ?? "Demon" }
  } catch {
    return { title: "Demon" }
  }
}

export default async function ArmoryDemonPage({ params }: Props) {
  const id = decodeURIComponent((await params).id).trim()
  if (!isValidDemonId(id)) notFound()

  let demon
  let dbError: string | null = null
  try {
    demon = loadArmoryDemonDetail(id)
  } catch (error) {
    if (error instanceof WorldDbMissingError) {
      dbError = error.message
      demon = null
    } else {
      throw error
    }
  }

  if (!dbError && !demon) notFound()

  const backHref = demon?.ownerCharacter
    ? `/armory/${encodeURIComponent(demon.ownerCharacter)}/demons`
    : "/armory"

  return (
    <section className="site-atmosphere mx-auto max-w-5xl px-4 py-8">
      <p className="mb-4 text-xs">
        <Link href={backHref} className="hover:text-gold-dim">
          ←{" "}
          {demon?.ownerCharacter
            ? `${demon.ownerCharacter} demons`
            : "Armory"}
        </Link>
      </p>

      {dbError ? (
        <p className="text-sm text-[#ff9b9b]">{dbError}</p>
      ) : demon ? (
        <ArmoryDemonProfileView demon={demon} />
      ) : null}

      <div className="mt-10 border-t border-border pt-6">
        <p className="mb-3 text-xs tracking-wide text-muted-foreground uppercase">
          Search character
        </p>
        <ArmorySearch />
      </div>
    </section>
  )
}

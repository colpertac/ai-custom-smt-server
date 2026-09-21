import Image from "next/image"
import Link from "next/link"

import { getSkill } from "@/lib/skill-catalog"
import { cn } from "@/lib/utils"

export function ArmorySkillChip({
  skillId,
  progress,
  link = true,
  size = 20,
  className,
}: {
  skillId: number
  progress?: number
  /** When false, render plain text (e.g. inside a parent Link). */
  link?: boolean
  size?: number
  className?: string
}) {
  if (skillId <= 0) return null
  const skill = getSkill(skillId)
  const name = skill?.name ?? `Skill ${skillId}`
  const title = skill
    ? `${name} (#${skillId})`
    : `Unknown skill #${skillId}`

  const icon = skill?.iconSrc ? (
    <Image
      src={skill.iconSrc}
      alt=""
      width={size}
      height={size}
      className="pixelated shrink-0 border border-border bg-black/40 object-contain"
      unoptimized
    />
  ) : (
    <span
      className="inline-block shrink-0 border border-border bg-muted/40"
      style={{ width: size, height: size }}
      aria-hidden
    />
  )

  const body = (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 text-xs text-foreground",
        link && "hover:text-gold-hot",
        className
      )}
      title={title}
    >
      {icon}
      <span className="truncate">{name}</span>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
        #{skillId}
      </span>
      {progress != null ? (
        <span className="shrink-0 text-muted-foreground">
          · {progress}%
        </span>
      ) : null}
    </span>
  )

  if (!link) return body

  return (
    <Link
      href={`/wiki/skills/${skillId}`}
      className="inline-flex max-w-full no-underline"
    >
      {body}
    </Link>
  )
}

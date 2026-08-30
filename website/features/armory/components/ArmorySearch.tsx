"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function ArmorySearch({
  initialName = "",
  autoFocus = false,
}: {
  initialName?: string
  autoFocus?: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const q = name.trim()
        if (!q) return
        router.push(`/armory/search?q=${encodeURIComponent(q)}`)
      }}
    >
      <Field className="min-w-[14rem] flex-1">
        <FieldLabel htmlFor="armory-name">Character name</FieldLabel>
        <Input
          id="armory-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name or partial name…"
          maxLength={32}
          autoComplete="off"
          autoFocus={autoFocus}
        />
      </Field>
      <Button type="submit" size="sm">
        Look up
      </Button>
    </form>
  )
}

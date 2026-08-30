"use client"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"

type CharacterNameComboboxProps = {
  value: string
  onValueChange: (value: string) => void
  names: string[]
  placeholder?: string
  id?: string
  onEnter?: () => void
  disabled?: boolean
}

/** Free-text character filter with shadcn Combobox suggestions. */
export function CharacterNameCombobox({
  value,
  onValueChange,
  names,
  placeholder = "Optional — type or pick a character",
  id,
  onEnter,
  disabled,
}: CharacterNameComboboxProps) {
  return (
    <Combobox
      items={names}
      value={value || null}
      onValueChange={(next) => onValueChange(next ?? "")}
      inputValue={value}
      onInputValueChange={(next) => onValueChange(next)}
    >
      <ComboboxInput
        id={id}
        className="w-full"
        placeholder={placeholder}
        disabled={disabled}
        showClear={Boolean(value)}
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            // Don't block selecting a highlighted item via Enter when the
            // popup is open with a highlight — Base UI handles that first.
            if (!(e.target as HTMLElement).closest('[data-slot="combobox-content"]')) {
              onEnter()
            }
          }
        }}
      />
      <ComboboxContent className="rounded-none">
        <ComboboxEmpty>No characters match.</ComboboxEmpty>
        <ComboboxList>
          {(name) => (
            <ComboboxItem key={name} value={name} className="rounded-none">
              {name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

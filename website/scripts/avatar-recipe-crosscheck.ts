/**
 * TypeScript half of avatar/tools/crosscheck_recipes.py: resolve characters with
 * lib/avatar-recipe.ts and print the recipes as JSON.
 *
 * Usage (from website/; normally run by crosscheck_recipes.py):
 *   tsx --conditions=react-server --tsconfig tsconfig.json \
 *     scripts/avatar-recipe-crosscheck.ts INPUT.json
 * (react-server: lib/armory's imports pull in `server-only`.)
 *
 * INPUT.json: {"catalog": "/path/catalog.json", "names": ["cat", ...],
 *              "characters": {"label": AvatarCharacter, ...}}
 * Names are read from the world DB (COMP_WORLD_DB) with loadAvatarCharacter.
 * Output: {"names": {name: recipe | null}, "characters": {label: recipe}}
 */
import { readFileSync } from "node:fs"

import {
  resolveAvatarRecipe,
  type AvatarCatalog,
  type AvatarCharacter,
} from "../lib/avatar-recipe"
import { loadAvatarCharacter } from "../lib/avatar-recipe-load"

type Input = {
  catalog: string
  names?: string[]
  characters?: Record<string, AvatarCharacter>
}

const input = JSON.parse(readFileSync(process.argv[2], "utf-8")) as Input
const catalog = JSON.parse(
  readFileSync(input.catalog, "utf-8")
) as AvatarCatalog

const names: Record<string, unknown> = {}
for (const name of input.names ?? []) {
  const character = loadAvatarCharacter(name)
  names[name] = character ? resolveAvatarRecipe(character, catalog) : null
}
const characters: Record<string, unknown> = {}
for (const [label, character] of Object.entries(input.characters ?? {})) {
  characters[label] = resolveAvatarRecipe(character, catalog)
}
process.stdout.write(JSON.stringify({ names, characters }))

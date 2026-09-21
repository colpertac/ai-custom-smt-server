/**
 * Per-branch Mitama set-bonus recipes (Ara/Nigi/Kusi/Saki counts → effect).
 * Sourced from in-game Mitama Sets UI (same order as REUNION_BRANCH_NAMES).
 */

export type MitamaSetRecipe = {
  /** Ara (red) count required. */
  ara: number
  /** Nigi (blue) count required. */
  nigi: number
  /** Kusi (green) count required. */
  kusi: number
  /** Saki (yellow) count required. */
  saki: number
  effect: string
}

export type MitamaBranchSetBonuses = {
  name: string
  recipes: MitamaSetRecipe[]
}

export const MITAMA_BRANCH_SET_BONUSES: MitamaBranchSetBonuses[] = [
  {
    name: "Tiwaz",
    recipes: [
      { ara: 4, nigi: 0, kusi: 0, saki: 0, effect: "Strength+50 Vitality+20" },
      { ara: 0, nigi: 4, kusi: 0, saki: 0, effect: "Magic+50 Intelligence+20" },
      { ara: 0, nigi: 0, kusi: 4, saki: 0, effect: "Speed+50 Intelligence+20" },
      { ara: 0, nigi: 0, kusi: 0, saki: 4, effect: "Luck+50 Vitality+20" },
    ],
  },
  {
    name: "Peorth",
    recipes: [
      { ara: 4, nigi: 0, kusi: 0, saki: 0, effect: "Fire+50%" },
      { ara: 0, nigi: 4, kusi: 0, saki: 0, effect: "Ice+50%" },
      { ara: 0, nigi: 0, kusi: 4, saki: 0, effect: "Force+50%" },
      { ara: 0, nigi: 0, kusi: 0, saki: 4, effect: "Electric+50%" },
    ],
  },
  {
    name: "Fehu",
    recipes: [
      { ara: 4, nigi: 0, kusi: 0, saki: 0, effect: "HP Cost-50%" },
      { ara: 0, nigi: 4, kusi: 0, saki: 0, effect: "MP Cost-50%" },
      { ara: 0, nigi: 0, kusi: 4, saki: 0, effect: "Incantation-40%" },
      { ara: 0, nigi: 0, kusi: 0, saki: 4, effect: "Cooldown-40%" },
    ],
  },
  {
    name: "Eihwaz",
    recipes: [
      {
        ara: 4,
        nigi: 0,
        kusi: 0,
        saki: 0,
        effect: "Received Close-Range Damage-30%",
      },
      {
        ara: 0,
        nigi: 4,
        kusi: 0,
        saki: 0,
        effect: "Received Spell Damage-30%",
      },
      {
        ara: 0,
        nigi: 0,
        kusi: 4,
        saki: 0,
        effect: "Received Long-Range Damage-30%",
      },
      { ara: 0, nigi: 0, kusi: 0, saki: 4, effect: "Critical Defense+200" },
    ],
  },
  {
    name: "Uruz",
    recipes: [
      { ara: 2, nigi: 0, kusi: 2, saki: 0, effect: "Close-Range+30" },
      { ara: 0, nigi: 2, kusi: 0, saki: 2, effect: "Spell+30" },
      { ara: 3, nigi: 0, kusi: 1, saki: 0, effect: "Support+30" },
      { ara: 1, nigi: 0, kusi: 3, saki: 0, effect: "Long-Range+30" },
    ],
  },
  {
    name: "Hagalaz",
    recipes: [
      { ara: 2, nigi: 2, kusi: 0, saki: 0, effect: "Close-Range Damage+20%" },
      { ara: 0, nigi: 0, kusi: 2, saki: 2, effect: "Spell Damage+20%" },
      { ara: 3, nigi: 1, kusi: 0, saki: 0, effect: "Long-Range Damage+20%" },
      { ara: 1, nigi: 3, kusi: 0, saki: 0, effect: "All Damage+10%" },
    ],
  },
  {
    name: "Laguz",
    recipes: [
      {
        ara: 0,
        nigi: 2,
        kusi: 2,
        saki: 0,
        effect: "Magnetite Summon Cost-50%",
      },
      {
        ara: 2,
        nigi: 0,
        kusi: 0,
        saki: 2,
        effect: "Status-Changing Skill Rate+40%",
      },
      { ara: 0, nigi: 0, kusi: 3, saki: 1, effect: "Soul Points Gained+40%" },
      {
        ara: 0,
        nigi: 0,
        kusi: 1,
        saki: 3,
        effect: "Movement Speed Increase 40%",
      },
    ],
  },
  {
    name: "Ansuz",
    recipes: [
      {
        ara: 3,
        nigi: 1,
        kusi: 0,
        saki: 0,
        effect: "Null Elemental Burn and Poison",
      },
      { ara: 0, nigi: 3, kusi: 1, saki: 0, effect: "Null Mute and Confusion" },
      {
        ara: 0,
        nigi: 0,
        kusi: 3,
        saki: 1,
        effect: "Null Paralyze, Bind and Stone",
      },
      {
        ara: 1,
        nigi: 0,
        kusi: 0,
        saki: 3,
        effect: "Null Muddle, Sleep and Charm",
      },
    ],
  },
  {
    name: "Nauthiz",
    recipes: [
      {
        ara: 3,
        nigi: 1,
        kusi: 0,
        saki: 0,
        effect: "P Def+20 Ailment Resistance+10",
      },
      {
        ara: 0,
        nigi: 3,
        kusi: 1,
        saki: 0,
        effect: "M Def+20 Ailment Resistance+10",
      },
      { ara: 0, nigi: 0, kusi: 3, saki: 1, effect: "P Def+20 Mag Def+20" },
      { ara: 1, nigi: 0, kusi: 0, saki: 3, effect: "Ailment Resistance+20" },
    ],
  },
  {
    name: "Ingwaz",
    recipes: [
      { ara: 3, nigi: 1, kusi: 0, saki: 0, effect: "EXP gained+40%" },
      { ara: 0, nigi: 3, kusi: 1, saki: 0, effect: "Curative+50%" },
      { ara: 0, nigi: 0, kusi: 3, saki: 1, effect: "Received Curative+50%" },
      { ara: 1, nigi: 0, kusi: 0, saki: 3, effect: "Magnetite Gain+40%" },
    ],
  },
  {
    name: "Sowilo",
    recipes: [
      { ara: 4, nigi: 4, kusi: 0, saki: 0, effect: "Max HP+250" },
      { ara: 0, nigi: 0, kusi: 4, saki: 4, effect: "Max MP+60" },
      { ara: 1, nigi: 0, kusi: 2, saki: 3, effect: "HP Regen+40" },
      { ara: 2, nigi: 3, kusi: 1, saki: 0, effect: "MP Regen+10" },
    ],
  },
  {
    name: "Wyrd",
    recipes: [
      { ara: 0, nigi: 4, kusi: 4, saki: 0, effect: "LB Power+20%" },
      { ara: 4, nigi: 0, kusi: 0, saki: 4, effect: "LB Chance+15%" },
      {
        ara: 1,
        nigi: 2,
        kusi: 0,
        saki: 3,
        effect: "LB Power+10% LB Chance+10%",
      },
      { ara: 0, nigi: 3, kusi: 1, saki: 2, effect: "Crit+100" },
    ],
  },
]

/** True when branch slot counts meet (or exceed) a recipe. Same recipe never stacks. */
export function mitamaSetRecipeMet(
  counts: { ara: number; nigi: number; kusi: number; saki: number },
  recipe: MitamaSetRecipe
): boolean {
  return (
    counts.ara >= recipe.ara &&
    counts.nigi >= recipe.nigi &&
    counts.kusi >= recipe.kusi &&
    counts.saki >= recipe.saki
  )
}

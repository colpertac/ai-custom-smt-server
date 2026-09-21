/**
 * DEMON_FUSION_SKILLS from server constants.xml — inheritanceType → 3 skill IDs
 * (fusion progress tiers Lv1–Lv3). Index matches DevilData.inheritanceType.
 */
export const DEMON_FUSION_SKILL_TIERS: ReadonlyArray<
  readonly [number, number, number]
> = [
  [40025, 40026, 40027],
  [40028, 40029, 40030],
  [40031, 40032, 40033],
  [40037, 40038, 40039],
  [40034, 40035, 40036],
  [40025, 40026, 40027],
  [40001, 40002, 40003],
  [40004, 40005, 40006],
  [40007, 40008, 40009],
  [40010, 40011, 40012],
  [40016, 40017, 40018],
  [40019, 40020, 40021],
  [40022, 40023, 40024],
  [40049, 40050, 40051],
  [40055, 40056, 40057],
  [40043, 40044, 40045],
  [40046, 40047, 40048],
  [40052, 40053, 40054],
  [40040, 40041, 40042],
  [40013, 40014, 40015],
  [40013, 40014, 40015],
]

/**
 * SkillData.inheritanceRestriction index ↔ demon inheritanceRestrictions bit
 * (`demonMask & (1 << skillRestriction) != 0` allows fusion inherit).
 *
 * Names match in-game skill cards / CoS tutorial (“Wing learnable”, “Maiden”, …)
 * and SkillData groupings (Breath skills → 1, Eyes → 11, etc.).
 * Bit 10 is set on many demons but unused by any current skill.
 */
export const DEVIL_INHERITANCE_CATEGORY: Record<number, string> = {
  0: "Possible",
  1: "Breath",
  2: "Wing",
  3: "Charge",
  4: "Bite",
  5: "Claw",
  6: "Needle",
  7: "Weapon",
  8: "Impossible",
  9: "Maiden",
  11: "Eyes",
}

export function demonFusionSkillTiers(
  inheritanceType: number
): readonly [number, number, number] | null {
  if (
    inheritanceType < 0 ||
    inheritanceType >= DEMON_FUSION_SKILL_TIERS.length
  ) {
    return null
  }
  return DEMON_FUSION_SKILL_TIERS[inheritanceType]
}

/** Bits set in inheritanceRestrictions = skill types this demon can inherit. */
export function devilInheritanceAllowedCategories(
  restrictions: number
): { bit: number; label: string }[] {
  const out: { bit: number; label: string }[] = []
  for (let bit = 0; bit < 16; bit++) {
    if ((restrictions & (1 << bit)) === 0) continue
    const label = DEVIL_INHERITANCE_CATEGORY[bit]
    if (!label) continue // skip unused/unknown bits (e.g. 10)
    out.push({ bit, label })
  }
  return out
}

export function formatDevilFamily(family: string): string {
  if (!family || family === "NONE") return "—"
  return family
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ")
}

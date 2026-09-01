/**
 * Per-dungeon CP values for the built-in "Grindy" preset (admin payout sheet).
 * Normal = grindy × 5, Generous = grindy × 10.
 */
export const GRINDY_CP_BY_PAYOUT_ID: Record<string, number> = {
  // Suginami Tunnels
  "suginami-bronze": 3,
  "suginami-silver": 6,
  "suginami-gold": 12,
  "suginami-unknown": 2.5,
  "suginami-bronze-bearcat": 8,

  // Celu Tower
  "celu-bronze": 5,
  "celu-silver": 10,
  "celu-gold": 28,
  "celu-bronze-bearcat": 8,

  // Shinagawa Catacomb
  "catacomb-bronze": 6,

  // Old Ichigaya Camp
  "ichigaya-bronze": 4,
  "ichigaya-silver": 4,
  "ichigaya-gold": 6,
  "ichigaya-2king": 10,
  "ichigaya-3king": 12,
  "ichigaya-4king": 12,
  "ichigaya-assassins": 10,
  "ichigaya-tokisada": 15,

  // Shibuya Quartz
  "quartz-bronze": 3,
  "quartz-silver": 5,
  "quartz-gold": 6,

  // Old Tokyo Metro
  "old-tokyo-metro": 5,

  // Kagurazaka Zhu Que
  "zhuque-bronze": 4,
  "zhuque-gold": 40,
  "zhuque-amaterasu-m": 40,
  "zhuque-amaterasu-f": 43,
  "zhuque-susanoo": 50,

  // Ueno Mirage
  "mirage-bronze": 5,
  "mirage-silver": 11,
  "mirage-gold": 30,
  "mirage-astaroth": 35,
  "mirage-ishtar": 50,

  // Nakano Underground
  "nakano-ug-bronze": 8,
  "nakano-ug-silver": 15,
  "nakano-ug-gold": 50,

  // YOIDORE
  yoidore: 10,
}

/** Built-in presets scale the grindy sheet values. */
export const BUILTIN_PRESET_SCALE: Record<string, number> = {
  grindy: 1,
  normal: 5,
  generous: 10,
}

/**
 * Per-dungeon Magical Golden Apple amounts for the built-in "Grindy" preset
 * (Golden Light / NPC3401). Sourced from stock NPC3401.xml flag 340102.
 * Normal = grindy × 5, Generous = grindy × 10 (same scales as CP).
 */
export const GRINDY_APPLES_BY_PAYOUT_ID: Record<string, number> = {
  // Suginami Tunnels
  "suginami-bronze": 15,
  "suginami-bronze-bearcat": 15,
  "suginami-silver": 210,
  "suginami-gold": 950,

  // Celu Tower
  "celu-bronze": 15,
  "celu-bronze-bearcat": 15,
  "celu-silver": 250,
  "celu-per-floor": 250,
  "celu-gold": 2450,

  // Old Ichigaya Camp
  "ichigaya-bronze": 5,
  "ichigaya-2king": 80,
  "ichigaya-silver": 340,

  // Shibuya Quartz
  "quartz-bronze": 20,
  "quartz-silver": 80,
  "quartz-gold": 205,
  "quartz-per-floor": 205,

  // Shinagawa Catacomb (shared partial — one amount for B/S/G)
  "catacomb-bronze": 25,
  "catacomb-silver": 25,
  "catacomb-gold": 25,

  // Kagurazaka Zhu Que (shared bronze/silver/gold partial)
  "zhuque-bronze": 20,
  "zhuque-silver": 20,
  "zhuque-gold": 20,

  // Ueno Mirage (bronze partial shared with some variants)
  "mirage-bronze": 20,
  "mirage-gold": 20,
  "mirage-astaroth": 20,
  "mirage-ishtar": 20,

  // Nakano Underground
  "nakano-ug-bronze": 25,
}

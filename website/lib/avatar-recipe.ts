/**
 * Character → avatar recipe (skeleton, Avatar/<Folder>/*.nif parts, hair/eye colours), the rule
 * ImagineClient.exe applies when it assembles a character for character select / a portrait.
 *
 * Port of avatar/tools/resolve.py (the reference; rules reverse engineered from the exe, notes in
 * AI/avatar-renderer.md "Assembly precedence and variants"). The output has the shape of
 * `resolve.py --json` per character, which avatar/viewer/buildScene.js consumes directly.
 * Pure: everything client-derived comes from the catalog (avatar/tools/catalog.py).
 */

export const AVATAR_CATALOG_VERSION = 2

/** [modelID, subCategory, equipSlot (EquippedItems index, null = not EQUIP_TYPE_*), name] */
export type AvatarCatalogItem = [
  number | null,
  number,
  number | null,
  string | null,
]
/** CEquipModelData procInfo entry: [folder index, type (0 none, 1 set, 2 hide, 3 variant), value]. */
export type AvatarModelProc = [number, number, string]

export type AvatarCatalog = {
  version: number
  itemFields: string[]
  hair: Record<string, string>
  face: Record<string, string>
  eye: Record<string, string>
  /** SkinType → skeleton; stances = KFM sequence id → KF file (character-select stance ids only). */
  skeletons: Record<
    string,
    { name: string; scale: number; stances: Record<string, string> }
  >
  palette: Record<string, number[]>
  items: Record<string, AvatarCatalogItem>
  /** Item id → CItemData motionData [idle, combatIdle, walk, run] (only items with any set). */
  motions: Record<string, number[]>
  models: Record<string, AvatarModelProc[]>
  /** Avatar folder → names of the entries in the client's Avatar/<folder>. */
  files: Record<string, string[]>
}

export type AvatarCharacter = {
  /** Character.Gender: 1 = female. */
  gender: number
  skinType: number
  hairType: number
  faceType: number
  eyeType: number
  hairColor: number
  leftEyeColor: number
  rightEyeColor: number
  /** EquippedVA: VA slot → item type. */
  va: Record<number, number>
  /** EquippedItems: equip slot (EQUIP_SLOTS index) → item type. */
  equip: Record<number, number>
}

export type AvatarRecipePart = {
  file: string | null
  why: string
  exists: boolean
}

export type AvatarRecipe = {
  gender: "M" | "W"
  skinType: number
  skeleton: {
    nif: string
    scale: number
    /** Character creation pose (510 Common_SampleStay). */
    idle: string
    /** Character select stance KF (weapon class / item override); null if the KFM lacks it. */
    stance: string | null
  } | null
  parts: Record<string, AvatarRecipePart>
  colors: { hair: number[]; eyeRight: number[]; eyeLeft: number[] }
  notes: string[]
}

/** CEquipModelData procInfo index → Avatar folder. */
export const AVATAR_FOLDERS = [
  "Hair",
  "Face",
  "Eyes",
  "NeckM",
  "Body",
  "GloveR",
  "GloveL",
  "Legs",
  "Feet",
  "HairAcce",
  "FaceAcce",
  "EarringR",
  "EarringL",
  "HairAcceM",
  "HandR",
  "HandL",
  "RingR",
  "RingL",
  "ExtraA",
  "ExtraB",
  "ExtraC",
  "ExtraD",
  "ExtraE",
  "ExtraF",
  "R",
  "L",
] as const

/** Character.EquippedItems order. */
const EQUIP_SLOT_NAMES = [
  "head",
  "face",
  "neck",
  "top",
  "arms",
  "bottom",
  "feet",
  "comp",
  "ring",
  "earring",
  "extra",
  "back",
  "talisman",
  "weapon",
  "bullets",
]
const WEAPON_SLOT = 13
// ImagineClient.exe tables (VA 0x87f29c8, 0x87f307c): equip slots in merge order.
const MERGE_ORDER = [3, 0, 5, 7, 4, 6, 10, 1, 2, 13, 8, 9, 11, 12, 14]
const VA_CHECK_ORDER = MERGE_ORDER.slice(0, 13)
// 0x467c20: folder -> equip slot that owns it (null = base layer Hair/Face/Eyes).
const FOLDER_OWNER: (number | null)[] = [
  null,
  null,
  null,
  2,
  3,
  4,
  4,
  5,
  6,
  0,
  1,
  9,
  9,
  2,
  7,
  7,
  8,
  8,
  11,
  10,
  11,
  10,
  10,
  10,
  13,
  13,
]
// 0x45f420/0x45f6a0: setting (or hiding) these folders removes a later slot from the merge.
const SET_SKIPS = new Map([
  [7, 5],
  [8, 6],
  [9, 0],
])
const HIDE_SKIPS = new Map([
  [4, 3],
  [7, 5],
  [8, 6],
  [9, 0],
])
// 0x45cb30: these weapons never set R.
const NO_R_FOLDER = new Set([
  1586, 1594, 1595, 2303, 2346, 2347, 2348, 2349, 2350, 2351, 2383, 2805,
])
// 0x45f390: Celty's Suit skips HairAcce while Celty Helmet is worn.
const CELTY_SUIT = new Set([23207, 23209])
const CELTY_HELMET = new Set([33011, 33012])
// 0x460360: player skin types that get the default skin layer.
const PLAYER_SKIN_TYPES = new Set([100, 101, 102, 200, 201, 202])
const NO_ITEM = new Set([-1, 0xffffffff])
const R_FOLDER = 24
const L_FOLDER = 25
// Character-select stance (0x833e30). 0x466a90: weapon subCategory (ItemData byte +5) → weapon
// class, default 2; 0x466bb0: class → stay sequence id, default 73 OneSword_DefaultStay.
const WEAPON_CLASS = new Map([
  [0x18, 3],
  [0x35, 3],
  [0x19, 4],
  [0x36, 4],
  [0x1a, 5],
  [0x37, 5],
  [0x1b, 6],
  [0x38, 6],
  [0x1c, 7],
  [0x39, 7],
  [0x1d, 8],
  [0x3a, 8],
  [0x1e, 9],
  [0x3b, 9],
  [0x1f, 10],
  [0x20, 11],
  [0x21, 12],
  [0x22, 13],
  [0x23, 14],
  [0x24, 15],
  [0x25, 16],
  [0x26, 17],
])
const CLASS_STAY = new Map([
  [2, 53],
  [5, 113],
  [8, 113],
  [7, 153],
  [11, 231],
  [12, 291],
  [15, 291],
  [13, 271],
])
const DEFAULT_STAY = 73
const UNARMED_STAY = 53
// 0x466c50 → 0x491d20: a top (slot 3) from this list decides alone (0x491b60); otherwise the first
// item in OVERRIDE_ORDER (0x87f6120) with any CItemData motionData value set wins; its idle
// (0 = keep the weapon stance) is used.
const OVERRIDE_TOPS = new Set([
  23436, 23437, 23438, 23439, 23444, 23445, 23636, 23637, 23769, 23770,
])
const OVERRIDE_ORDER = [7, 13, 10, 8, 12, 9, 11, 2, 4, 0, 1, 6, 3, 5, 14]

const fileSets = new WeakMap<AvatarCatalog, Map<string, Set<string>>>()

function fileExists(catalog: AvatarCatalog, folder: string, file: string) {
  let sets = fileSets.get(catalog)
  if (!sets) {
    sets = new Map()
    fileSets.set(catalog, sets)
  }
  let set = sets.get(folder)
  if (!set) {
    set = new Set(catalog.files[folder] ?? [])
    sets.set(folder, set)
  }
  return set.has(file)
}

/** Python's % (result has the sign of the divisor). */
function pyMod(a: number, b: number) {
  return ((a % b) + b) % b
}

/** Python str() of an optional value, for the notes/why strings. */
function pyStr(v: string | number | null | undefined) {
  return v == null ? "None" : String(v)
}

/** Order entries by key as numbers (Python sorted(dict.items()) on int keys). */
function numericEntries(rec: Record<number, number>): [number, number][] {
  return Object.entries(rec)
    .map(([k, v]) => [Number(k), v] as [number, number])
    .sort((a, b) => a[0] - b[0])
}

/**
 * 0x833e30: the character-select stay sequence id, and the item that overrode it (or null).
 * Uses the merged (drawn) equipment, so a VA weapon decides the class; nothing in slot 13 → 53.
 */
function stanceMotion(
  drawn: Map<number, number>,
  catalog: AvatarCatalog
): [number, number | null] {
  const weapon = drawn.get(WEAPON_SLOT)
  if (weapon === undefined) return [UNARMED_STAY, null]
  let seq = UNARMED_STAY
  // 0x103 GameInfo vtable+0x4c: ItemData record, byte +5 = subCategory.
  const info = catalog.items[String(weapon)]
  if (info) {
    const cls = WEAPON_CLASS.get(info[1]) ?? 2
    seq = CLASS_STAY.get(cls) ?? DEFAULT_STAY
  }
  // 0x491a90: CItemData motionData; "found" when any of the four is set.
  const motion = (i: number) => catalog.motions[String(i)]
  let m: number[] | undefined
  let src: number | null = null
  const top = drawn.get(3)
  if (top !== undefined && OVERRIDE_TOPS.has(top)) {
    m = motion(top)
    src = top
  } else {
    for (const s of OVERRIDE_ORDER) {
      const i = drawn.get(s)
      if (i === undefined || i >>> 0 >= 0x7fffffff) continue
      if (motion(i)) {
        m = motion(i)
        src = i
        break
      }
    }
  }
  if (m && m[0]) return [m[0], src]
  return [seq, null]
}

/**
 * SkinType is a CModelData1 id: 100-102 male, 200-202 female, last digit = body type A/B/C.
 * The skeleton is loaded by the CModelData name; each body type has its own KF set
 * ({M,W}_0{1,2,3}_*), and character creation plays 510 Common_SampleStay. `stance` is the KF the
 * character select screen plays (stanceMotion via the skeleton's KFM; null if the KFM lacks it).
 */
function skeleton(
  ch: AvatarCharacter,
  catalog: AvatarCatalog,
  drawn: Map<number, number>
): [AvatarRecipe["skeleton"], string | null] {
  const skin = ch.skinType
  const rec = catalog.skeletons[String(skin)]
  if (!rec || pyMod(skin, 100) > 2) return [null, null]
  const prefix = `${skin >= 200 ? "W" : "M"}_0${pyMod(skin, 100) + 1}`
  const [seq, src] = stanceMotion(drawn, catalog)
  const kf = rec.stances[String(seq)]
  let note: string | null = null
  if (kf === undefined) note = `stance ${seq} not in ${rec.name}.kfm`
  else if (src !== null)
    note = `stance ${seq} from item ${src} (CItemData idle)`
  return [
    {
      nif: `Bone/${rec.name}.nif`,
      scale: rec.scale,
      idle: `Bone/${prefix}_510_Common_SampleStay_01.kf`,
      stance: kf ? `Bone/${kf}` : null,
    },
    note,
  ]
}

/** 0x45cbd0/0x45f420: replace '_A' in '_A.' with suffix, else insert suffix before the first '.'. */
export function avatarVariant(filename: string, suffix: string): string {
  const i = filename.indexOf("_A.")
  if (i >= 0) return filename.slice(0, i) + suffix + filename.slice(i + 2)
  // No '.' → Python slices at -1, i.e. before the last character; slice() matches.
  const j = filename.indexOf(".")
  return filename.slice(0, j) + suffix + filename.slice(j)
}

function isWeaponVa(slot: number) {
  return slot === WEAPON_SLOT || (slot >= 15 && slot <= 30)
}

function catalogLookups(catalog: AvatarCatalog) {
  const item = (i: number) => catalog.items[String(i)]
  const sub = (i: number) => item(i)?.[1] ?? 0
  const equipSlot = (i: number) => item(i)?.[2] ?? null
  // 0x467d10
  const vaSlot = (i: number) =>
    sub(i) >= 0x17 && sub(i) <= 0x26 ? sub(i) - 8 : equipSlot(i)
  const row = (i: number) => {
    const modelId = item(i)?.[0]
    return modelId == null ? undefined : catalog.models[String(modelId)]
  }
  return { item, sub, equipSlot, vaSlot, row }
}

/** 0x488210 + 0x4878b0 (param_4=1, character select / portrait): equip slot -> drawn item. */
function mergeVa(ch: AvatarCharacter, catalog: AvatarCatalog) {
  const { item, sub, equipSlot, vaSlot, row } = catalogLookups(catalog)
  const equip = new Map(
    numericEntries(ch.equip).filter(([, i]) => i != null && !NO_ITEM.has(i))
  )
  const wsub = equip.has(WEAPON_SLOT) ? sub(equip.get(WEAPON_SLOT)!) : 0x17
  const va = new Map(
    numericEntries(ch.va).filter(
      ([s, i]) => !NO_ITEM.has(i) && (!isWeaponVa(s) || sub(i) === wsub)
    )
  )
  const out = new Map(equip)
  const notes: string[] = []
  let locked = false
  for (const [s, i] of va) {
    if (!isWeaponVa(s)) {
      out.set(s, i)
    } else if (s === 15 && !equip.has(WEAPON_SLOT)) {
      out.set(WEAPON_SLOT, i)
      locked = true
    } else if (
      !locked &&
      equip.has(WEAPON_SLOT) &&
      item(i) !== undefined &&
      sub(equip.get(WEAPON_SLOT)!) === sub(i)
    ) {
      out.set(WEAPON_SLOT, i)
    }
  }
  // A real item that reaches into another slot's folder is dropped when a VA item owns that folder.
  for (const c of VA_CHECK_ORDER) {
    const i = equip.get(c)
    if (i === undefined) continue
    const key = c === WEAPON_SLOT ? vaSlot(i) : c
    const procs = row(i)
    if ((key != null && va.has(key)) || !procs) continue
    for (const [f, kind] of procs) {
      const s = FOLDER_OWNER[f] ?? null
      if (kind === 0 || kind === 3 || s === null || s === c) continue
      let hit = false
      if (s === WEAPON_SLOT) {
        const wv = equip.has(WEAPON_SLOT) ? vaSlot(equip.get(WEAPON_SLOT)!) : 15
        hit = wv != null && va.has(wv)
      } else {
        for (const vi of va.values()) {
          const r2 = row(vi)
          if (!r2) {
            hit = equipSlot(vi) === s
          } else {
            let k2 = 0
            for (const [ff, kk] of r2) if (ff === f) k2 = kk
            hit = k2 === 1 || (k2 === 2 && kind !== 2)
          }
          if (hit) break
        }
      }
      if (hit) {
        notes.push(
          `${EQUIP_SLOT_NAMES[c]} item ${i} dropped: VA owns ${AVATAR_FOLDERS[f]}`
        )
        out.delete(c)
        if (c === 7) out.set(7, -1)
      }
    }
  }
  return { drawn: out, notes }
}

type FolderRecord = { mode: number; file: string; why: string }

function compareProcs(a: AvatarModelProc, b: AvatarModelProc) {
  if (a[0] !== b[0]) return a[0] - b[0]
  if (a[1] !== b[1]) return a[1] - b[1]
  return a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0
}

/** Resolve a character into the recipe the viewer draws (resolve.py `resolve`). */
export function resolveAvatarRecipe(
  ch: AvatarCharacter,
  catalog: AvatarCatalog
): AvatarRecipe {
  const g = ch.gender === 1 ? "W" : "M"
  // folder -> mode 1 base, 2 set, 3 hidden, 4 variant pending (0 = touched, nothing set)
  const rec = new Map<number, FolderRecord>()
  if (PLAYER_SKIN_TYPES.has(ch.skinType)) {
    // 0x460360
    for (const [f, p] of [
      [4, "Body"],
      [7, "Legs"],
      [6, "GloveL"],
      [5, "GloveR"],
      [8, "Feet"],
    ] as const) {
      rec.set(f, {
        mode: 1,
        file: `${g}_01_${p}_Skin_001.nif`,
        why: "exe default skin",
      })
    }
    rec.set(15, {
      mode: 1,
      file: `${g}_01_HandL_H_010.nif`,
      why: "exe default HandL",
    })
  }
  for (const [f, key, value, table] of [
    [0, "HairType", ch.hairType, catalog.hair],
    [2, "EyeType", ch.eyeType, catalog.eye],
    [1, "FaceType", ch.faceType, catalog.face],
  ] as const) {
    const file = table[String(value)]
    if (file) rec.set(f, { mode: 1, file, why: `base ${key}=${value}` })
  }

  const { drawn, notes } = mergeVa(ch, catalog)
  const skip = new Set<number>()
  const rl = new Set<number>()
  const markRL = (f: number) => {
    if (f !== R_FOLDER && f !== L_FOLDER) return
    rl.add(f)
    if (rl.has(R_FOLDER) && rl.has(L_FOLDER)) skip.add(WEAPON_SLOT)
  }
  for (const s of MERGE_ORDER) {
    // 0x45fe20
    const item = drawn.get(s)
    if (item === undefined) continue
    if (skip.has(s)) {
      notes.push(
        `${EQUIP_SLOT_NAMES[s]} item ${item} skipped: an earlier slot set/hid its folder`
      )
      continue
    }
    const info = catalog.items[String(item)]
    const modelId = info?.[0]
    const row = modelId == null ? undefined : catalog.models[String(modelId)]
    const src = item !== ch.equip[s] ? "VA" : "EQ"
    const label = `${EQUIP_SLOT_NAMES[s]} ${src}=${item} (${pyStr(info?.[3])}) model=${pyStr(modelId)}`
    if (!row) {
      notes.push(`${label}: no CEquipModelData row, contributes nothing`)
      continue
    }
    for (const [f, kind, value] of [...row].sort(compareProcs)) {
      let r = rec.get(f)
      if (!r) {
        r = { mode: 0, file: "", why: "" }
        rec.set(f, r)
      }
      const mode = r.mode
      if (kind === 1) {
        if (mode === 0 || mode === 1) {
          if (
            (f === R_FOLDER && NO_R_FOLDER.has(item)) ||
            (f === 9 &&
              CELTY_SUIT.has(item) &&
              CELTY_HELMET.has(drawn.get(0) ?? 0))
          ) {
            continue
          }
          rec.set(f, { mode: 2, file: value, why: label })
          const skipSlot = SET_SKIPS.get(f)
          if (skipSlot !== undefined) skip.add(skipSlot)
          markRL(f)
        } else if (mode === 4) {
          rec.set(f, {
            mode: 2,
            file: avatarVariant(value, r.file),
            why: `${label} + variant ${r.file}`,
          })
        } else {
          notes.push(
            `${label}: ${AVATAR_FOLDERS[f]} already ${mode === 2 ? "set" : "hidden"} by ${r.why}`
          )
        }
      } else if (kind === 2) {
        if (mode === 0 || mode === 1) {
          rec.set(f, { mode: 3, file: "", why: "hidden by " + label })
          const skipSlot = HIDE_SKIPS.get(f)
          if (skipSlot !== undefined) skip.add(skipSlot)
          markRL(f)
        }
      } else if (kind === 3) {
        if (mode === 0) {
          rec.set(f, { mode: 4, file: "_" + value, why: label })
        } else if (mode === 2 || (mode === 1 && f !== 7)) {
          r.file = avatarVariant(r.file, "_" + value)
          r.why = `${r.why} + variant _${value} from ${label}`
        }
      }
    }
  }

  // 0x460590: modes 1/2 load the file (nothing if it does not exist), anything else draws nothing.
  const parts: Record<string, AvatarRecipePart> = {}
  for (const f of [...rec.keys()].sort((a, b) => a - b)) {
    const r = rec.get(f)!
    const folder = AVATAR_FOLDERS[f]
    const file = r.mode === 1 || r.mode === 2 ? r.file : null
    parts[folder] = {
      file,
      why: r.why || "variant with no base",
      exists: !!file && fileExists(catalog, folder, file),
    }
  }

  const [skel, stanceNote] = skeleton(ch, catalog, drawn)
  if (stanceNote) notes.push(stanceNote)
  const pal = catalog.palette
  const color = (id: number) => pal[String(id)] ?? [0, 0, 0, 1]
  const right = ch.rightEyeColor
  const left = ch.leftEyeColor || right
  return {
    gender: g,
    skinType: ch.skinType,
    skeleton: skel,
    parts,
    colors: {
      hair: color(ch.hairColor),
      eyeRight: color(right),
      eyeLeft: color(left),
    },
    notes,
  }
}

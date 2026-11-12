import { describe, expect, it } from "vitest"

import golden from "@/lib/avatar-recipe.golden.json"
import {
  AVATAR_CATALOG_VERSION,
  avatarVariant,
  resolveAvatarRecipe,
  type AvatarCatalog,
  type AvatarCharacter,
  type AvatarModelProc,
  type AvatarRecipe,
} from "@/lib/avatar-recipe"

// Golden fixture: written by `python3 avatar/tools/crosscheck_recipes.py --golden …` from the
// world DB and resolve.py (the reference), with the catalog rows those characters touch.
type Golden = {
  catalog: AvatarCatalog
  characters: Record<
    string,
    { character: AvatarCharacter; recipe: AvatarRecipe }
  >
}
const GOLDEN = golden as unknown as Golden

describe("resolveAvatarRecipe golden (resolve.py output)", () => {
  it("fixture has the expected characters and catalog version", () => {
    expect(Object.keys(GOLDEN.characters).sort()).toEqual([
      "cat",
      "cat3",
      "catm",
      "vaf",
      "vam",
    ])
    expect(GOLDEN.catalog.version).toBe(AVATAR_CATALOG_VERSION)
  })

  for (const [name, { character, recipe }] of Object.entries(
    GOLDEN.characters
  )) {
    it(`${name} matches resolve.py`, () => {
      expect(resolveAvatarRecipe(character, GOLDEN.catalog)).toEqual(recipe)
    })
  }
})

// ---------------------------------------------------------------------------
// Targeted rules on a synthetic catalog.

// Folder indices (CEquipModelData procInfo).
const F = {
  Hair: 0,
  Face: 1,
  Eyes: 2,
  Body: 4,
  Legs: 7,
  Feet: 8,
  HairAcce: 9,
  FaceAcce: 10,
  R: 24,
  L: 25,
}
// Equip slots.
const S = { head: 0, face: 1, top: 3, bottom: 5, feet: 6, comp: 7, weapon: 13 }
const SET = 1
const HIDE = 2
const VARIANT = 3

type ItemSpec = {
  procs?: AvatarModelProc[]
  slot?: number | null
  sub?: number
  name?: string
  /** CItemData motionData [idle, combatIdle, walk, run]. */
  motion?: number[]
}

// KFM sequence id → KF stem (prefix added per skeleton); the female KFMs also have 720.
const STANCE_STEMS: Record<number, string> = {
  53: "053_Boxing_DefaultStay_01",
  73: "073_OneSword_DefaultStay_01",
  113: "113_BluntWeapon_DefaultStay_01",
  153: "153_Speard_DefaultStay_01",
  231: "231_HandGun_DefaultStay_01",
  271: "271_ShotGun_DefaultStay_01",
  291: "291_Rifle_DefaultStay_01",
  707: "707_Common_ExStay_05",
}
function stances(prefix: string, extra: Record<number, string> = {}) {
  const out: Record<string, string> = {}
  for (const [id, stem] of Object.entries({ ...STANCE_STEMS, ...extra }))
    out[id] = `${prefix}_${stem}.kf`
  return out
}

function catalog(items: Record<number, ItemSpec>, files: string[] = []) {
  const cat: AvatarCatalog = {
    version: AVATAR_CATALOG_VERSION,
    itemFields: ["modelID", "subCategory", "equipSlot", "name"],
    hair: { "1": "M_01_Hair_Sh_001.nif" },
    face: { "1": "M_01_Face_Skin_001.nif" },
    eye: { "1": "M_01_Eyes_Skin_001.nif" },
    skeletons: {
      "101": {
        name: "M_01_Bone_Btype_01_EM",
        scale: 1,
        stances: stances("M_02"),
      },
      "201": {
        name: "W_01_Bone_Btype_01_OK",
        scale: 0.94,
        stances: stances("W_02", {
          153: "153_Spear_DefaultStay_01",
          720: "720_Common_ExStay_13",
        }),
      },
    },
    palette: { "1": [1, 0, 0, 1], "2": [0, 1, 0, 1] },
    items: {},
    motions: {},
    models: {},
    files: {},
  }
  for (const [id, spec] of Object.entries(items)) {
    cat.items[id] = [
      Number(id),
      spec.sub ?? 0,
      spec.slot ?? null,
      spec.name ?? `I${id}`,
    ]
    if (spec.procs) cat.models[id] = spec.procs
    if (spec.motion) cat.motions[id] = spec.motion
  }
  for (const path of files) {
    const [folder, file] = path.split("/")
    ;(cat.files[folder] ??= []).push(file)
  }
  return cat
}

function character(over: Partial<AvatarCharacter> = {}): AvatarCharacter {
  return {
    gender: 0,
    skinType: 101,
    hairType: 1,
    faceType: 1,
    eyeType: 1,
    hairColor: 1,
    leftEyeColor: 2,
    rightEyeColor: 1,
    va: {},
    equip: {},
    ...over,
  }
}

describe("avatarVariant (0x45cbd0)", () => {
  it("replaces _A in _A.", () => {
    expect(avatarVariant("M_01_Legs_Io_D010_A.nif", "_B")).toBe(
      "M_01_Legs_Io_D010_B.nif"
    )
  })
  it("otherwise inserts before the first '.'", () => {
    expect(avatarVariant("M_01_Body_Fb_001.nif", "_B")).toBe(
      "M_01_Body_Fb_001_B.nif"
    )
    expect(avatarVariant("a.b.nif", "_C")).toBe("a_C.b.nif")
    expect(avatarVariant("X_A_A.nif", "_C")).toBe("X_A_C.nif")
  })
  it("with no '.' inserts before the last character (Python slice -1)", () => {
    expect(avatarVariant("abc", "_B")).toBe("ab_Bc")
    expect(avatarVariant("", "_B")).toBe("_B")
  })
})

describe("resolveAvatarRecipe rules", () => {
  it("base layer: default skins, hair/face/eyes, skeleton and pose", () => {
    const r = resolveAvatarRecipe(character(), catalog({}))
    expect(r.gender).toBe("M")
    expect(r.skeleton).toEqual({
      nif: "Bone/M_01_Bone_Btype_01_EM.nif",
      scale: 1,
      idle: "Bone/M_02_510_Common_SampleStay_01.kf",
      stance: "Bone/M_02_053_Boxing_DefaultStay_01.kf",
    })
    expect(Object.keys(r.parts)).toEqual([
      "Hair",
      "Face",
      "Eyes",
      "Body",
      "GloveR",
      "GloveL",
      "Legs",
      "Feet",
      "HandL",
    ])
    expect(r.parts.Body).toEqual({
      file: "M_01_Body_Skin_001.nif",
      why: "exe default skin",
      exists: false,
    })
    expect(r.parts.HandL.file).toBe("M_01_HandL_H_010.nif")
    expect(r.parts.Hair.why).toBe("base HairType=1")
  })

  it("unknown SkinType → skeleton null and no default skin layer", () => {
    const r = resolveAvatarRecipe(character({ skinType: 103 }), catalog({}))
    expect(r.skeleton).toBeNull()
    expect(r.parts.Body).toBeUndefined()
    expect(r.parts.Hair.file).toBe("M_01_Hair_Sh_001.nif")
    const female = resolveAvatarRecipe(
      character({ gender: 1, skinType: 201 }),
      catalog({})
    )
    expect(female.skeleton).toEqual({
      nif: "Bone/W_01_Bone_Btype_01_OK.nif",
      scale: 0.94,
      idle: "Bone/W_02_510_Common_SampleStay_01.kf",
      stance: "Bone/W_02_053_Boxing_DefaultStay_01.kf",
    })
    expect(female.parts.Body.file).toBe("W_01_Body_Skin_001.nif")
  })

  it("merge order: first set wins (top before head)", () => {
    const cat = catalog({
      10: { procs: [[F.FaceAcce, SET, "head.nif"]] },
      11: { procs: [[F.FaceAcce, SET, "top.nif"]] },
    })
    const r = resolveAvatarRecipe(
      character({ equip: { [S.head]: 10, [S.top]: 11 } }),
      cat
    )
    expect(r.parts.FaceAcce.file).toBe("top.nif")
    expect(r.parts.FaceAcce.why).toBe("top EQ=11 (I11) model=11")
    expect(r.notes).toContain(
      "head EQ=10 (I10) model=10: FaceAcce already set by top EQ=11 (I11) model=11"
    )
  })

  it("set and hide rank equally: whichever comes first stays", () => {
    const cat = catalog({
      10: { procs: [[F.FaceAcce, SET, "head.nif"]] },
      11: { procs: [[F.FaceAcce, HIDE, ""]] },
      12: { procs: [[F.FaceAcce, SET, "top.nif"]] },
      13: { procs: [[F.FaceAcce, HIDE, ""]] },
    })
    const hidden = resolveAvatarRecipe(
      character({ equip: { [S.top]: 11, [S.head]: 10 } }),
      cat
    )
    expect(hidden.parts.FaceAcce).toEqual({
      file: null,
      why: "hidden by top EQ=11 (I11) model=11",
      exists: false,
    })
    expect(hidden.notes).toContain(
      "head EQ=10 (I10) model=10: FaceAcce already hidden by hidden by top EQ=11 (I11) model=11"
    )
    const set = resolveAvatarRecipe(
      character({ equip: { [S.top]: 12, [S.head]: 13 } }),
      cat
    )
    expect(set.parts.FaceAcce.file).toBe("top.nif")
  })

  it("whole-slot skips: Legs→bottom, Feet→feet, HairAcce→head", () => {
    const cat = catalog({
      20: {
        procs: [
          [F.Legs, SET, "legs.nif"],
          [F.Feet, HIDE, ""],
          [F.HairAcce, SET, "acce.nif"],
        ],
      },
      21: { procs: [[F.FaceAcce, SET, "b.nif"]] },
      22: { procs: [[F.FaceAcce, SET, "f.nif"]] },
      23: { procs: [[F.FaceAcce, SET, "h.nif"]] },
    })
    const r = resolveAvatarRecipe(
      character({
        equip: { [S.top]: 20, [S.bottom]: 21, [S.feet]: 22, [S.head]: 23 },
      }),
      cat
    )
    expect(r.parts.FaceAcce).toBeUndefined()
    expect(r.notes).toEqual([
      "head item 23 skipped: an earlier slot set/hid its folder",
      "bottom item 21 skipped: an earlier slot set/hid its folder",
      "feet item 22 skipped: an earlier slot set/hid its folder",
    ])
  })

  it("Body: hiding removes the top slot, setting does not (top merges first)", () => {
    const cat = catalog({
      30: { procs: [[F.Body, HIDE, ""]] },
      31: { procs: [[F.Body, SET, "b.nif"]] },
    })
    const hidden = resolveAvatarRecipe(
      character({ equip: { [S.top]: 30 } }),
      cat
    )
    expect(hidden.parts.Body.file).toBeNull()
    // The hide → top skip only matters for a later top, which the merge order never has.
    const viaBottom = resolveAvatarRecipe(
      character({ equip: { [S.bottom]: 30, [S.top]: 31 } }),
      cat
    )
    expect(viaBottom.parts.Body.file).toBe("b.nif")
  })

  it("setting or hiding both R and L skips the weapon slot", () => {
    const cat = catalog({
      40: {
        procs: [
          [F.R, SET, "r.nif"],
          [F.L, HIDE, ""],
        ],
      },
      41: { procs: [[F.R, SET, "r.nif"]] },
      42: { procs: [[F.L, SET, "w.nif"]], slot: S.weapon, sub: 0x18 },
    })
    const both = resolveAvatarRecipe(
      character({ equip: { [S.top]: 40, [S.weapon]: 42 } }),
      cat
    )
    expect(both.notes).toContain(
      "weapon item 42 skipped: an earlier slot set/hid its folder"
    )
    const onlyR = resolveAvatarRecipe(
      character({ equip: { [S.top]: 41, [S.weapon]: 42 } }),
      cat
    )
    expect(onlyR.parts.L.file).toBe("w.nif")
  })

  it("weapon VA: drawn only when its subCategory matches the real weapon", () => {
    const cat = catalog({
      50: { procs: [[F.R, SET, "real.nif"]], slot: S.weapon, sub: 0x18 },
      51: { procs: [[F.R, SET, "same.nif"]], slot: S.weapon, sub: 0x18 },
      52: { procs: [[F.R, SET, "other.nif"]], slot: S.weapon, sub: 0x19 },
      53: { procs: [[F.R, SET, "sword.nif"]], slot: S.weapon, sub: 0x17 },
    })
    const same = resolveAvatarRecipe(
      character({ equip: { [S.weapon]: 50 }, va: { 16: 51 } }),
      cat
    )
    expect(same.parts.R.file).toBe("same.nif")
    expect(same.parts.R.why).toBe("weapon VA=51 (I51) model=51")
    const other = resolveAvatarRecipe(
      character({ equip: { [S.weapon]: 50 }, va: { 17: 52 } }),
      cat
    )
    expect(other.parts.R.file).toBe("real.nif")
    // No real weapon: only VA key 15 draws, and only with subCategory 0x17.
    const key15 = resolveAvatarRecipe(character({ va: { 15: 53 } }), cat)
    expect(key15.parts.R.file).toBe("sword.nif")
    const key16 = resolveAvatarRecipe(character({ va: { 16: 53 } }), cat)
    expect(key16.parts.R).toBeUndefined()
    const wrongSub = resolveAvatarRecipe(character({ va: { 15: 51 } }), cat)
    expect(wrongSub.parts.R).toBeUndefined()
  })

  it("Hidden VA keeps the base and drops real items reaching into its folders", () => {
    const cat = catalog({
      45011: { slot: S.head, sub: 40, name: "Hidden" }, // no CEquipModelData row
      45012: { slot: S.face, sub: 40, name: "Hidden" },
      60: { procs: [[F.HairAcce, SET, "hat.nif"]], slot: S.head },
      61: {
        procs: [
          [F.Body, SET, "coat.nif"],
          [F.HairAcce, SET, "hood.nif"],
        ],
        slot: S.top,
      },
      62: { procs: [[F.FaceAcce, SET, "mask.nif"]], slot: 7 },
    })
    const r = resolveAvatarRecipe(
      character({
        equip: { [S.head]: 60, [S.top]: 61, [S.comp]: 62 },
        va: { [S.head]: 45011, [S.face]: 45012 },
      }),
      cat
    )
    expect(r.parts.HairAcce).toBeUndefined()
    expect(r.parts.Body.file).toBe("M_01_Body_Skin_001.nif")
    expect(r.parts.FaceAcce).toBeUndefined()
    expect(r.notes).toEqual([
      "top item 61 dropped: VA owns HairAcce",
      "comp item 62 dropped: VA owns FaceAcce",
      "head VA=45011 (Hidden) model=45011: no CEquipModelData row, contributes nothing",
      "comp VA=-1 (None) model=None: no CEquipModelData row, contributes nothing",
      "face VA=45012 (Hidden) model=45012: no CEquipModelData row, contributes nothing",
    ])
  })

  it("a VA item that sets a folder drops the real item reaching into it", () => {
    const cat = catalog({
      70: { procs: [[F.HairAcce, SET, "va-hat.nif"]], slot: S.head },
      71: {
        procs: [
          [F.Body, SET, "coat.nif"],
          [F.HairAcce, SET, "hood.nif"],
        ],
        slot: S.top,
      },
    })
    const r = resolveAvatarRecipe(
      character({ equip: { [S.top]: 71 }, va: { [S.head]: 70 } }),
      cat
    )
    expect(r.parts.HairAcce.file).toBe("va-hat.nif")
    expect(r.parts.Body.file).toBe("M_01_Body_Skin_001.nif")
    expect(r.notes).toEqual(["top item 71 dropped: VA owns HairAcce"])
  })

  it("variants apply to set parts and base parts except Legs", () => {
    const cat = catalog({
      80: {
        procs: [
          [F.Body, VARIANT, "B"],
          [F.Legs, VARIANT, "B"],
        ],
      },
      81: { procs: [[F.FaceAcce, SET, "M_01_FaceAcce_X_A.nif"]] },
      82: { procs: [[F.FaceAcce, VARIANT, "C"]] },
    })
    const r = resolveAvatarRecipe(
      character({ equip: { [S.top]: 80, [S.head]: 81, [S.face]: 82 } }),
      cat
    )
    expect(r.parts.Body.file).toBe("M_01_Body_Skin_001_B.nif")
    expect(r.parts.Body.why).toBe(
      "exe default skin + variant _B from top EQ=80 (I80) model=80"
    )
    expect(r.parts.Legs.file).toBe("M_01_Legs_Skin_001.nif")
    expect(r.parts.FaceAcce.file).toBe("M_01_FaceAcce_X_C.nif")
  })

  it("a pending variant is consumed by a later set; unused it draws nothing", () => {
    const cat = catalog(
      {
        90: { procs: [[F.FaceAcce, VARIANT, "B"]] },
        91: { procs: [[F.FaceAcce, SET, "M_01_FaceAcce_Y_A.nif"]] },
      },
      ["FaceAcce/M_01_FaceAcce_Y_B.nif"]
    )
    const used = resolveAvatarRecipe(
      character({ equip: { [S.top]: 90, [S.head]: 91 } }),
      cat
    )
    expect(used.parts.FaceAcce).toEqual({
      file: "M_01_FaceAcce_Y_B.nif",
      why: "head EQ=91 (I91) model=91 + variant _B",
      exists: true,
    })
    const unused = resolveAvatarRecipe(
      character({ equip: { [S.top]: 90 } }),
      cat
    )
    expect(unused.parts.FaceAcce).toEqual({
      file: null,
      why: "top EQ=90 (I90) model=90",
      exists: false,
    })
  })

  it("a file missing from the client draws nothing (exists false, no fallback)", () => {
    const cat = catalog({ 100: { procs: [[F.FaceAcce, SET, "gone.nif"]] } }, [
      "Hair/M_01_Hair_Sh_001.nif",
    ])
    const r = resolveAvatarRecipe(character({ equip: { [S.top]: 100 } }), cat)
    expect(r.parts.FaceAcce).toEqual({
      file: "gone.nif",
      why: "top EQ=100 (I100) model=100",
      exists: false,
    })
    expect(r.parts.Hair.exists).toBe(true)
  })

  it("NO_R_FOLDER weapons never set R (0x45cb30)", () => {
    const cat = catalog({
      1586: {
        procs: [
          [F.R, SET, "r.nif"],
          [F.L, SET, "l.nif"],
        ],
        slot: S.weapon,
        sub: 0x18,
      },
    })
    const r = resolveAvatarRecipe(
      character({ equip: { [S.weapon]: 1586 } }),
      cat
    )
    expect(r.parts.R).toEqual({
      file: null,
      why: "variant with no base",
      exists: false,
    })
    expect(r.parts.L.file).toBe("l.nif")
  })

  it("Celty's Suit skips HairAcce while Celty Helmet is worn (0x45f390)", () => {
    const cat = catalog({
      23207: {
        procs: [
          [F.Body, SET, "suit.nif"],
          [F.HairAcce, SET, "suit-acce.nif"],
        ],
        slot: S.top,
      },
      33011: { procs: [[F.HairAcce, SET, "helmet.nif"]], slot: S.head },
    })
    const withHelmet = resolveAvatarRecipe(
      character({ equip: { [S.top]: 23207, [S.head]: 33011 } }),
      cat
    )
    expect(withHelmet.parts.Body.file).toBe("suit.nif")
    expect(withHelmet.parts.HairAcce.file).toBe("helmet.nif")
    const alone = resolveAvatarRecipe(
      character({ equip: { [S.top]: 23207 } }),
      cat
    )
    expect(alone.parts.HairAcce.file).toBe("suit-acce.nif")
  })

  it("colours: palette lookup, left eye falls back to the right eye", () => {
    const cat = catalog({})
    const r = resolveAvatarRecipe(
      character({ hairColor: 2, rightEyeColor: 1, leftEyeColor: 0 }),
      cat
    )
    expect(r.colors).toEqual({
      hair: [0, 1, 0, 1],
      eyeRight: [1, 0, 0, 1],
      eyeLeft: [1, 0, 0, 1],
    })
    const unknown = resolveAvatarRecipe(character({ hairColor: 99 }), cat)
    expect(unknown.colors.hair).toEqual([0, 0, 0, 1])
    expect(unknown.colors.eyeLeft).toEqual([0, 1, 0, 1])
  })
})

describe("character-select stance (0x833e30)", () => {
  const stance = (
    equip: Record<number, number>,
    cat: AvatarCatalog,
    over: Partial<AvatarCharacter> = {}
  ) => resolveAvatarRecipe(character({ equip, ...over }), cat)

  it("unarmed → 053 Boxing_DefaultStay", () => {
    const r = stance({}, catalog({}))
    expect(r.skeleton?.stance).toBe("Bone/M_02_053_Boxing_DefaultStay_01.kf")
    expect(r.skeleton?.idle).toBe("Bone/M_02_510_Common_SampleStay_01.kf")
    expect(r.notes).toEqual([])
  })

  it("each weapon subCategory maps through 0x466a90 → 0x466bb0", () => {
    // subCategory → stay id (0x17 gloves and 0x35-0x3b alias 0x18-0x1e; unknown → class 2).
    const cases: [number, number][] = [
      [0x17, 53],
      [0x18, 73],
      [0x19, 73],
      [0x1a, 113],
      [0x1b, 73],
      [0x1c, 153],
      [0x1d, 113],
      [0x1e, 73],
      [0x1f, 73],
      [0x20, 231],
      [0x21, 291],
      [0x22, 271],
      [0x23, 73],
      [0x24, 291],
      [0x25, 73],
      [0x26, 73],
      [0x35, 73],
      [0x37, 113],
      [0x39, 153],
      [0x3a, 113],
      [0x3b, 73],
      [0x00, 53],
      [0x34, 53],
    ]
    for (const [sub, seq] of cases) {
      const cat = catalog({ 500: { slot: S.weapon, sub } })
      const r = stance({ [S.weapon]: 500 }, cat)
      expect(r.skeleton?.stance, `sub ${sub}`).toBe(
        `Bone/M_02_${STANCE_STEMS[seq]}.kf`
      )
    }
  })

  it("female spear uses the W_ spelling; an item missing from ItemData keeps 053", () => {
    const cat = catalog({ 500: { slot: S.weapon, sub: 0x1c } })
    const w = stance({ [S.weapon]: 500 }, cat, { gender: 1, skinType: 201 })
    expect(w.skeleton?.stance).toBe("Bone/W_02_153_Spear_DefaultStay_01.kf")
    const m = stance({ [S.weapon]: 500 }, cat)
    expect(m.skeleton?.stance).toBe("Bone/M_02_153_Speard_DefaultStay_01.kf")
    const missing = stance({ [S.weapon]: 999 }, cat)
    expect(missing.skeleton?.stance).toBe(
      "Bone/M_02_053_Boxing_DefaultStay_01.kf"
    )
  })

  it("uses the drawn weapon: a VA weapon of the same subCategory, or VA slot 15 when unarmed", () => {
    const cat = catalog({
      2621: { slot: S.weapon, sub: 0x20 },
      2004: { slot: S.weapon, sub: 0x20 },
      2101: { slot: S.weapon, sub: 0x21 },
    })
    const va = stance({ [S.weapon]: 2621 }, cat, { va: { 24: 2004 } })
    expect(va.parts).toEqual(stance({ [S.weapon]: 2621 }, cat).parts)
    expect(va.skeleton?.stance).toBe("Bone/M_02_231_HandGun_DefaultStay_01.kf")
    // A VA rifle is discarded under a real handgun, so the handgun decides.
    const mismatch = stance({ [S.weapon]: 2621 }, cat, { va: { 25: 2101 } })
    expect(mismatch.skeleton?.stance).toBe(
      "Bone/M_02_231_HandGun_DefaultStay_01.kf"
    )
    // No real weapon: only a VA in slot 15 with subCategory 0x17 is drawn.
    const gloves = catalog({ 1901: { slot: S.weapon, sub: 0x17 } })
    const unarmedVa = stance({}, gloves, { va: { 15: 1901 } })
    expect(unarmedVa.skeleton?.stance).toBe(
      "Bone/M_02_053_Boxing_DefaultStay_01.kf"
    )
  })

  it("0x466c50: an item with CItemData motion data overrides, first in 0x87f6120 order", () => {
    const cat = catalog({
      500: { slot: S.weapon, sub: 0x20 },
      4068: { slot: 11, motion: [707, 0, 0, 708] },
      6621: { slot: S.face, motion: [53, 0, 0, 0] },
      1538: { slot: S.weapon, sub: 0x1a, motion: [0, 134, 705, 705] },
    })
    const back = stance({ [S.weapon]: 500, 11: 4068 }, cat)
    expect(back.skeleton?.stance).toBe("Bone/M_02_707_Common_ExStay_05.kf")
    expect(back.notes).toContain("stance 707 from item 4068 (CItemData idle)")
    // back (11) comes before face (1) in 0x87f6120.
    const both = stance({ [S.weapon]: 500, 11: 4068, [S.face]: 6621 }, cat)
    expect(both.skeleton?.stance).toBe("Bone/M_02_707_Common_ExStay_05.kf")
    // The first item with motion data wins even when its idle is 0 (keeps the weapon stance).
    const zeroIdle = stance({ [S.weapon]: 1538, 11: 4068 }, cat)
    expect(zeroIdle.skeleton?.stance).toBe(
      "Bone/M_02_113_BluntWeapon_DefaultStay_01.kf"
    )
    // A VA item overrides too (the merged map is searched).
    const va = stance({ [S.weapon]: 500 }, cat, { va: { 11: 4068 } })
    expect(va.skeleton?.stance).toBe("Bone/M_02_707_Common_ExStay_05.kf")
  })

  it("0x466c50 is only consulted with a weapon in slot 13", () => {
    const cat = catalog({ 4068: { slot: 11, motion: [707, 0, 0, 708] } })
    const r = stance({ 11: 4068 }, cat)
    expect(r.skeleton?.stance).toBe("Bone/M_02_053_Boxing_DefaultStay_01.kf")
  })

  it("a listed costume top decides alone (0x491b60), even without motion data", () => {
    const cat = catalog({
      500: { slot: S.weapon, sub: 0x20 },
      23437: { slot: S.top, motion: [707, 0, 0, 708] },
      23436: { slot: S.top },
      4068: { slot: 11, motion: [707, 0, 0, 708] },
    })
    const listed = stance({ [S.weapon]: 500, [S.top]: 23437 }, cat)
    expect(listed.skeleton?.stance).toBe("Bone/M_02_707_Common_ExStay_05.kf")
    // Listed top without motion data: no override, the back item is not searched.
    const blocked = stance({ [S.weapon]: 500, [S.top]: 23436, 11: 4068 }, cat)
    expect(blocked.skeleton?.stance).toBe(
      "Bone/M_02_231_HandGun_DefaultStay_01.kf"
    )
  })

  it("a sequence the skeleton's KFM lacks → stance null with a note", () => {
    const cat = catalog({
      500: { slot: S.weapon, sub: 0x20 },
      4052: { slot: 11, motion: [720, 0, 0, 721] },
    })
    const m = stance({ [S.weapon]: 500, 11: 4052 }, cat)
    expect(m.skeleton?.stance).toBeNull()
    expect(m.notes).toContain("stance 720 not in M_01_Bone_Btype_01_EM.kfm")
    const w = stance({ [S.weapon]: 500, 11: 4052 }, cat, {
      gender: 1,
      skinType: 201,
    })
    expect(w.skeleton?.stance).toBe("Bone/W_02_720_Common_ExStay_13.kf")
  })
})

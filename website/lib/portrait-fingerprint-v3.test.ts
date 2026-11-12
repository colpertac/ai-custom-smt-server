import { describe, expect, it } from "vitest"

import type { AvatarRecipe } from "@/lib/avatar-recipe"
import {
  canonicalAvatarRecipe,
  portraitFingerprintV3,
  portraitFingerprintV3Canonical,
} from "@/lib/portrait-fingerprint-v3"
import { RENDERER_VERSION } from "@/lib/portrait-render-mode"

function recipe(over: Partial<AvatarRecipe> = {}): AvatarRecipe {
  return {
    gender: "M",
    skinType: 101,
    skeleton: {
      nif: "M_01_Skeleton.nif",
      scale: 1,
      idle: "Common_SampleStay.kf",
      stance: "Sword_Stay.kf",
    },
    parts: {
      Hair: { file: "M_01_Hair_006.nif", why: "hairType 6", exists: true },
      Body: { file: "M_01_Body_23602.nif", why: "VA top", exists: true },
      Face: { file: "M_01_Face_005.nif", why: "faceType 5", exists: true },
      Legs: { file: "M_01_Legs_Missing.nif", why: "item", exists: false },
      Feet: { file: null, why: "hidden by set", exists: false },
    },
    colors: { hair: [10, 20, 30], eyeRight: [1, 2, 3], eyeLeft: [1, 2, 3] },
    notes: ["note a"],
    ...over,
  }
}

describe("canonicalAvatarRecipe", () => {
  it("keeps only pixel fields, existing parts sorted by folder", () => {
    expect(canonicalAvatarRecipe(recipe())).toEqual({
      gender: "M",
      skeleton: {
        nif: "M_01_Skeleton.nif",
        scale: 1,
        stance: "Sword_Stay.kf",
        idle: "Common_SampleStay.kf",
      },
      parts: {
        Body: "M_01_Body_23602.nif",
        Face: "M_01_Face_005.nif",
        Hair: "M_01_Hair_006.nif",
      },
      colors: { hair: [10, 20, 30], eyeRight: [1, 2, 3], eyeLeft: [1, 2, 3] },
    })
    expect(Object.keys(canonicalAvatarRecipe(recipe()).parts)).toEqual([
      "Body",
      "Face",
      "Hair",
    ])
  })

  it("canonical string has the v3 header", () => {
    expect(portraitFingerprintV3Canonical(recipe(), 2)).toMatch(
      new RegExp(`^v3\\|r=${RENDERER_VERSION}\\|c=2\\|p=front\\|\\{"gender":"M"`)
    )
  })
})

describe("portraitFingerprintV3", () => {
  const base = portraitFingerprintV3(recipe(), 2)

  it("is 16 hex and stable", () => {
    expect(base).toMatch(/^[0-9a-f]{16}$/)
    expect(portraitFingerprintV3(recipe(), 2)).toBe(base)
  })

  it("ignores why, notes, skinType, missing parts and part order", () => {
    const r = recipe()
    const shuffled: AvatarRecipe = {
      ...r,
      skinType: 102,
      notes: ["different", "notes"],
      parts: {
        Feet: { file: "M_01_Feet_x.nif", why: "x", exists: false },
        Face: { ...r.parts.Face, why: "changed why" },
        Hair: { ...r.parts.Hair, why: "" },
        Body: r.parts.Body,
      },
    }
    expect(portraitFingerprintV3(shuffled, 2)).toBe(base)
  })

  it("changes with colour, parts, stance, catalog or renderer version", () => {
    const fps = [
      portraitFingerprintV3(
        recipe({ colors: { hair: [10, 20, 31], eyeRight: [1, 2, 3], eyeLeft: [1, 2, 3] } }),
        2
      ),
      portraitFingerprintV3(
        recipe({ colors: { hair: [10, 20, 30], eyeRight: [1, 2, 3], eyeLeft: [9, 2, 3] } }),
        2
      ),
      portraitFingerprintV3(
        recipe({
          parts: {
            ...recipe().parts,
            Body: { file: "M_01_Body_1.nif", why: "", exists: true },
          },
        }),
        2
      ),
      portraitFingerprintV3(
        recipe({ skeleton: { ...recipe().skeleton!, stance: null } }),
        2
      ),
      portraitFingerprintV3(recipe({ gender: "W" }), 2),
      portraitFingerprintV3(recipe(), 3),
      portraitFingerprintV3(recipe(), 2, RENDERER_VERSION + 1),
    ]
    for (const fp of fps) expect(fp).not.toBe(base)
    expect(new Set(fps).size).toBe(fps.length)
  })
})

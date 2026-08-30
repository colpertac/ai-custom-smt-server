import { describe, expect, it } from "vitest"

import { resetPasswordTemplate, welcomeEmailTemplate } from "@/email-templates"

describe("email templates", () => {
  it("welcome includes account and download URLs", () => {
    const html = welcomeEmailTemplate({
      userName: "alice",
      accountUrl: "http://localhost:3500/account",
      downloadUrl: "http://localhost:3500/download",
    })
    expect(html).toContain("alice")
    expect(html).toContain("http://localhost:3500/account")
    expect(html).toContain("http://localhost:3500/download")
    expect(html).not.toContain("Questions?")
    expect(html).not.toMatch(/©/)
  })

  it("reset password includes token link", () => {
    const html = resetPasswordTemplate({
      userName: "alice",
      resetLink: "http://localhost:3500/reset-password?token=abc",
      expiresIn: "1 hour",
    })
    expect(html).toContain("token=abc")
    expect(html).toContain("1 hour")
    expect(html).not.toContain("Questions?")
    expect(html).not.toMatch(/©/)
  })
})

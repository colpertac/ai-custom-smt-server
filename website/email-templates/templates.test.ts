import { describe, expect, it } from "vitest"

import { resetPasswordTemplate, welcomeEmailTemplate } from "@/email-templates"

describe("email templates", () => {
  it("welcome includes account and download URLs", () => {
    const html = welcomeEmailTemplate({
      userName: "alice",
      accountUrl: "http://localhost:3000/account",
      downloadUrl: "http://localhost:3000/download",
    })
    expect(html).toContain("alice")
    expect(html).toContain("http://localhost:3000/account")
    expect(html).toContain("http://localhost:3000/download")
  })

  it("reset password includes token link", () => {
    const html = resetPasswordTemplate({
      userName: "alice",
      resetLink: "http://localhost:3000/reset-password?token=abc",
      expiresIn: "1 hour",
    })
    expect(html).toContain("token=abc")
    expect(html).toContain("1 hour")
  })
})

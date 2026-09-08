"use client"

import Link from "next/link"
import { CircleHelp } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { GM_COMMAND_TIERS } from "@/lib/server-config/gm-command-levels"

export function RegistrationUserLevelHelp() {
  return (
    <Dialog>
      <DialogTrigger
        type="button"
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label="UserLevel command access"
        title="UserLevel command access"
      >
        <CircleHelp className="size-3.5" aria-hidden />
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] gap-4 overflow-hidden p-5 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>UserLevel command access</DialogTitle>
          <DialogDescription>
            Commands unlock when{" "}
            <span className="font-medium text-foreground">
              UserLevel ≥ threshold
            </span>
            . Higher levels include every lower tier. Ladder: 1 Explorer, 10
            Story, 25 Creative, 50 Basic GM (
            <code className="text-[0.7rem]">GM_CMD_LVL_*</code> in{" "}
            <code className="text-[0.7rem]">constants.xml</code>).{" "}
            <Link
              href="/admin/commands-info"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Full usage guide →
            </Link>
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[min(70vh,32rem)] overflow-auto border border-border/80">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
              <tr className="border-b border-border/80">
                <th className="w-16 px-3 py-2 font-semibold whitespace-nowrap">
                  Level
                </th>
                <th className="w-32 px-3 py-2 font-semibold whitespace-nowrap">
                  Tier
                </th>
                <th className="px-3 py-2 font-semibold">Commands unlocked</th>
              </tr>
            </thead>
            <tbody>
              {GM_COMMAND_TIERS.map((tier, i) => (
                <tr
                  key={tier.level}
                  className={
                    i % 2 === 0
                      ? "border-b border-border/40 bg-background align-top"
                      : "border-b border-border/40 bg-muted/25 align-top"
                  }
                >
                  <td className="px-3 py-2.5 align-top whitespace-nowrap">
                    <span className="font-mono text-xs font-semibold text-gold-dim">
                      ≥{tier.level}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 align-top font-medium text-foreground">
                    {tier.label}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {tier.commands.map((cmd) => (
                        <span
                          key={cmd}
                          className="inline-block border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] leading-snug text-foreground/90"
                        >
                          {cmd}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  )
}

import type { Metadata } from "next"
import { Suspense } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AskChatPanel } from "@/features/help/components/AskChatPanel"
import { AskPanel } from "@/features/help/components/AskPanel"

export const metadata: Metadata = {
  title: "Help / Ask",
  description:
    "Quest help grounded in this server's exported catalogs and reviewed notes.",
}

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
        Help / Ask
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Ask how to complete a quest. Answers are built from{" "}
        <code className="text-foreground/90">quests.json</code>, NPC event
        links, and hand-reviewed notes — with citations, not guessed lore.
      </p>

      <div className="mt-8">
        <Tabs defaultValue="chat">
          <TabsList variant="line">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="search">Search</TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="pt-4">
            <AskChatPanel />
          </TabsContent>
          <TabsContent value="search" className="pt-4">
            <Suspense
              fallback={
                <p className="text-sm text-muted-foreground">Loading…</p>
              }
            >
              <AskPanel />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

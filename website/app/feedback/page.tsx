import type { Metadata } from "next"

import { FeedbackForm } from "@/features/feedback/components/FeedbackForm"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Feedback",
}

export default function FeedbackPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl tracking-wide">
            Feedback
          </CardTitle>
          <CardDescription>
            Something off? Untranslated text, a crashy NPC, lag at 4am — tell
            us. A few screenshots and extra detail help a lot.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FeedbackForm />
        </CardContent>
      </Card>
    </div>
  )
}

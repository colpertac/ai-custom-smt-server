import { redirect } from "next/navigation"

export default function PayoutsPage() {
  redirect("/events?tab=payouts")
}

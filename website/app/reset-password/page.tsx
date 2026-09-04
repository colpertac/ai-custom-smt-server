import Link from "next/link"

import { ResetPasswordForm } from "@/features/auth/components/ResetPasswordForm"
import { redirectIfLoggedIn } from "@/features/auth/server"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata = { title: "Reset password" }

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  await redirectIfLoggedIn()
  const params = await searchParams

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl tracking-wide">
            Choose a new password
          </CardTitle>
          <CardDescription>
            This updates both the portal and game login password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm token={params.token?.trim() ?? ""} />
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          <Link
            href="/login"
            className="text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}

import Link from "next/link"

import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm"
import { redirectIfLoggedIn } from "@/features/auth/server"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata = { title: "Forgot password" }

export default async function ForgotPasswordPage() {
  await redirectIfLoggedIn()

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl tracking-wide">
            Forgot password
          </CardTitle>
          <CardDescription>
            Enter your username or the email on your account. If a recovery
            email is set, we will send a reset link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
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

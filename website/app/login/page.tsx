import Link from "next/link"

import { LoginForm } from "@/features/auth/components/LoginForm"
import { redirectIfLoggedIn } from "@/features/auth/server"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata = { title: "Log in" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ passwordChanged?: string; lobbyRestarted?: string }>
}) {
  await redirectIfLoggedIn()

  const params = await searchParams
  const notice = params.lobbyRestarted
    ? "Game servers were restarted. Sign in again so admin tools can reach the lobby."
    : params.passwordChanged
      ? "Password updated. Sign in with your new password."
      : null

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl tracking-wide">
            Sign in
          </CardTitle>
          <CardDescription>
            Sign in with the username and password for this realm.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {notice ? (
            <p className="border border-gold-dim/40 bg-primary/10 px-3 py-2 text-xs text-gold-hot">
              {notice}
            </p>
          ) : null}
          <LoginForm />
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-2 text-xs text-muted-foreground">
          <p>
            No account?{" "}
            <Link
              href="/register"
              className="text-primary underline-offset-4 hover:underline"
            >
              Register
            </Link>
          </p>
          <Link
            href="/forgot-password"
            className="text-primary underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}

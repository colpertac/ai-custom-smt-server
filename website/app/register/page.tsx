import Link from "next/link"

import { RegisterForm } from "@/features/auth/components/RegisterForm"
import { redirectIfLoggedIn } from "@/features/auth/server"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata = { title: "Register" }

export default async function RegisterPage() {
  await redirectIfLoggedIn()

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl tracking-wide">
            Create account
          </CardTitle>
          <CardDescription>
            Pick a username and password that meet the rules shown below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterForm />
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          Already registered?{" "}
          <Link
            href="/login"
            className="ml-1 text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}

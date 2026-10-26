'use client'

import Image from 'next/image'
import Link from 'next/link'

import { Loader2 } from 'lucide-react'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

import gitHubIcon from '@/assets/github-icon.svg'

import { signInWithEmailAndPassword } from './actions'
import { useActionState } from 'react'

export function SignInForm() {
  const [state, formAction, isPending] = useActionState(
    signInWithEmailAndPassword,
    null
  )
  return (
    <form action={formAction} className="space-y-4">
      <h1>{state}</h1>
      <div className="space-y-1">
        <Label htmlFor="email">E-mail</Label>
        <Input name="email" type="email" id="email" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Password</Label>
        <Input name="password" type="password" id="password" />

        <Link
          href="/auth/forgot-password"
          className="text-foreground text-xs font-medium hover:underline"
        >
          Forgot your password?
        </Link>
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          'Sign in with e-mail'
        )}
      </Button>

      <Button variant={'link'} className="w-full" size={'sm'} asChild>
        <Link href={'/auth/sign-up'}>Create new account</Link>
      </Button>

      <Separator />

      <Button type="submit" variant={'outline'} className="w-full">
        <Image src={gitHubIcon} className="mr-2 size-4 dark:invert" alt="" />
        Sign in with GitHub
      </Button>
    </form>
  )
}

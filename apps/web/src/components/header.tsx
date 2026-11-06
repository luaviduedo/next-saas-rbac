import logoIcon from '@/assets/moon-icon.svg'
import Image from 'next/image'
import { ProfileButton } from './profile-button'
import { Slash } from 'lucide-react'
import { OrganizationSwitcher } from './organization-switcher'

export function Header() {
  return (
    <div className="mex-w-[1280px] items=center mx-auto flex justify-between">
      <div className="flex items-center gap-3">
        <Image src={logoIcon} className="size-6 dark:invert" alt="logo" />

        <Slash className="text-border size-3 -rotate-[24deg]" />

        <OrganizationSwitcher />
      </div>
      <div className="flex items-center gap-4">
        <ProfileButton />
      </div>
    </div>
  )
}

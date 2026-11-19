'use client'

import * as React from 'react'
import { Dialog as SheetPrimitive } from '@base-ui/react/dialog'
import { useRouter } from 'next/navigation'
import { cn } from 'cn'

import { Button } from '@/components/ui/button'
import { XIcon } from 'lucide-react'
import { SheetOverlay, SheetPortal } from './ui/sheet'

export function InterceptedSheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: 'top' | 'right' | 'bottom' | 'left'
  showCloseButton?: boolean
}) {
  const router = useRouter()
  function onDismiss() {
    router.back()
  }

  return (
    <SheetPrimitive.Root
      defaultOpen
      onOpenChange={(open, eventDetails) => {
        if (
          !open &&
          ['outside-press', 'escape-key'].includes(eventDetails.reason)
        ) {
          onDismiss()
        }
      }}
    >
      <SheetPortal>
        <SheetOverlay />

        <SheetPrimitive.Popup
          data-slot="sheet-content"
          data-side={side}
          className={cn(
            'bg-popover text-popover-foreground fixed z-50 flex flex-col gap-4 bg-clip-padding text-sm shadow-lg transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm',
            className
          )}
          {...props}
        >
          {children}

          {showCloseButton && (
            <SheetPrimitive.Close
              data-slot="sheet-close"
              onClick={onDismiss}
              render={
                <Button
                  variant="ghost"
                  className="absolute top-3 right-3"
                  size="icon-sm"
                />
              }
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </SheetPrimitive.Close>
          )}
        </SheetPrimitive.Popup>
      </SheetPortal>
    </SheetPrimitive.Root>
  )
}

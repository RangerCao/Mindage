import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { motion } from 'framer-motion'

import { cn } from '@/lib/utils'

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close
const SheetPortal = DialogPrimitive.Portal

const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const
const OVERLAY_DURATION = 0.16
const CONTENT_DURATION = 0.32

const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    asChild
    {...props}
  >
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: OVERLAY_DURATION, ease: EASE_OUT_QUINT }}
      className={cn('fixed inset-0 z-50 bg-black/40 backdrop-blur-sm', className)}
    />
  </DialogPrimitive.Overlay>
))
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName

type SheetSide = 'top' | 'bottom' | 'left' | 'right'

const sideStyles: Record<SheetSide, string> = {
  top: 'inset-x-0 top-0 border-b',
  bottom: 'inset-x-0 bottom-0 border-t',
  left: 'inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm',
  right: 'inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
}

const sideInitial: Record<SheetSide, { x?: string; y?: string }> = {
  top: { y: '-100%' },
  bottom: { y: '100%' },
  left: { x: '-100%' },
  right: { x: '100%' },
}

const sideAnimate = { top: {}, bottom: {}, left: {}, right: {} } as const

interface SheetContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'asChild'> {
  side?: SheetSide
}

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = 'right', className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      asChild
      {...props}
    >
      <motion.div
        initial={{ opacity: 0, ...sideInitial[side] }}
        animate={{ opacity: 1, ...sideAnimate[side] }}
        transition={{ duration: CONTENT_DURATION, ease: EASE_OUT_QUINT }}
        className={cn(
          'fixed z-50 gap-4 bg-background shadow-lg',
          sideStyles[side],
          className
        )}
      >
        {children}
        <DialogPrimitive.Close className="ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </motion.div>
    </DialogPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = DialogPrimitive.Content.displayName

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col space-y-1.5 p-4 text-left border-b border-border/40', className)}
    {...props}
  />
)
SheetHeader.displayName = 'SheetHeader'

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse p-4 border-t border-border/40 sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
)
SheetFooter.displayName = 'SheetFooter'

const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-base font-semibold text-foreground', className)}
    {...props}
  />
))
SheetTitle.displayName = DialogPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
SheetDescription.displayName = DialogPrimitive.Description.displayName

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
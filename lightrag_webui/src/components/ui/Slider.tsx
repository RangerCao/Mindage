import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'

import { cn } from '@/lib/utils'

const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      'relative flex w-full touch-none select-none items-center',
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
      <SliderPrimitive.Range className="absolute h-full bg-primary transition-[width] duration-150 ease-out" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        'block size-4 rounded-full border-2 border-primary bg-background shadow',
        'transition-[transform,box-shadow] duration-150 ease-out',
        'hover:scale-110 active:scale-95',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30'
      )}
    />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export default Slider

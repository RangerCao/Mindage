import Slider from '@/components/ui/Slider'
import Input from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { RotateCcw } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/Tooltip'

interface SliderFieldProps {
  id: string
  label: string
  tooltip?: string
  value: number | ''
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  defaultValue: number
  resetTitle: string
  /** Optional hard-clamp applied when blurring the number input. */
  clampOnBlur?: boolean
}

/**
 * Slider + number Input + reset button. Slider for thumb dragging;
 * number Input for precise entry. Visual value reads in the label slot.
 */
const SliderField = ({
  id,
  label,
  tooltip,
  value,
  onChange,
  min,
  max,
  step = 1,
  defaultValue,
  resetTitle,
  clampOnBlur = true
}: SliderFieldProps) => {
  const numeric = typeof value === 'number' ? value : defaultValue

  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <label htmlFor={id} className="ml-1 cursor-help">
                {label}
              </label>
            </TooltipTrigger>
            {tooltip ? (
              <TooltipContent side="left">
                <p>{tooltip}</p>
              </TooltipContent>
            ) : null}
          </Tooltip>
        </TooltipProvider>
        <span
          className={cn(
            'mr-1 text-[10px] tabular-nums text-muted-foreground',
            'transition-colors duration-150',
            numeric !== defaultValue && 'text-primary'
          )}
          aria-live="polite"
        >
          {numeric}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Slider
          id={id}
          value={[numeric]}
          min={min}
          max={max}
          step={step}
          onValueChange={(vals) => onChange(vals[0] ?? defaultValue)}
          aria-label={label}
          className="flex-1"
        />
        <Input
          type="number"
          value={value}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') {
              onChange(defaultValue)
              return
            }
            const parsed = parseInt(raw, 10)
            if (!isNaN(parsed)) onChange(parsed)
          }}
          onBlur={(e) => {
            if (!clampOnBlur) return
            const raw = e.target.value
            const parsed = parseInt(raw, 10)
            if (raw === '' || isNaN(parsed)) onChange(defaultValue)
            else if (parsed < min) onChange(min)
            else if (parsed > max) onChange(max)
          }}
          min={min}
          max={max}
          step={step}
          className={cn(
            'h-7 w-14 text-center tabular-nums',
            '[&::-webkit-outer-spin-button]:appearance-none',
            '[&::-webkit-inner-spin-button]:appearance-none',
            '[-moz-appearance:textfield]'
          )}
          aria-label={`${label} value`}
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onChange(defaultValue)}
                className="p-1 rounded hover:bg-accent transition-colors"
                title={resetTitle}
                aria-label={resetTitle}
              >
                <RotateCcw className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>{resetTitle}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </>
  )
}

export default SliderField
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Terminal Craft Fusion: Hard shadow + subtle glow + inset highlight
        default:
          'border-brutal border-primary/70 bg-primary/20 text-primary shadow-fusion hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-fusion-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-fusion-sm active:animate-[fusion-pulse_200ms_ease-out]',
        destructive:
          'border-brutal border-destructive/70 bg-destructive/20 text-destructive shadow-fusion-destructive hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-fusion-destructive-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-none active:animate-[fusion-pulse-destructive_200ms_ease-out]',
        outline:
          'border-brutal border-primary/70 bg-transparent text-primary shadow-fusion-dark hover:bg-primary/10 hover:border-primary hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-fusion-dark-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-fusion-sm',
        secondary:
          'border-brutal border-muted-foreground/50 bg-muted/30 text-muted-foreground shadow-fusion-dark hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-fusion-dark-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-none',
        ghost:
          'hover:bg-primary/10 hover:text-primary border-2 border-transparent hover:border-primary/30 hover:shadow-fusion-sm',
        link: 'text-primary underline-offset-4 hover:underline',
        terminal:
          'border-brutal border-primary/60 bg-primary/10 text-primary shadow-fusion hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-fusion-hover active:translate-x-[1px] active:translate-y-[1px] active:shadow-fusion-sm active:animate-[fusion-pulse_200ms_ease-out]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }

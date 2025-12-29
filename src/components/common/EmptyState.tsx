import { type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  secondaryAction?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in',
        className
      )}
    >
      {/* Terminal-style ASCII decoration */}
      <div className="text-primary/20 text-xs mb-4 font-mono">
        {'>'} _ {'<'}
      </div>

      {/* Icon container with brutal style */}
      <div className="relative mb-6">
        <div className="flex h-16 w-16 items-center justify-center border-brutal border-primary/50 bg-primary/5 shadow-brutal-sm">
          <Icon className="h-8 w-8 text-primary/60" />
        </div>
      </div>

      {/* Title with terminal comment style */}
      <h3 className="text-base font-semibold text-primary mb-2 text-glow-sm">
        // {title.toUpperCase().replace(/ /g, '_')}
      </h3>

      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-6">
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="flex gap-3">
          {action && (
            <Button onClick={action.onClick} size="sm">
              [{action.label}]
            </Button>
          )}
          {secondaryAction && (
            <Button
              onClick={secondaryAction.onClick}
              size="sm"
              variant="outline"
            >
              [{secondaryAction.label}]
            </Button>
          )}
        </div>
      )}

      {/* Bottom decoration */}
      <div className="text-primary/15 text-xs mt-8 font-mono">
        ─────────────────
      </div>
    </div>
  )
}

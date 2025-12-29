import { useState } from 'react'
import {
  Info,
  AlertTriangle,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTips } from '@/hooks/useTips'

export type TipType = 'info' | 'warning' | 'tip'

export interface ContextualTipProps {
  id: string
  type: TipType
  title: string
  description: string
  suggestions?: string[]
  details?: React.ReactNode
  dismissible?: boolean
  className?: string
}

const typeConfig: Record<
  TipType,
  {
    icon: typeof Info
    bgColor: string
    borderColor: string
    iconColor: string
    titleColor: string
  }
> = {
  info: {
    icon: Info,
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    iconColor: 'text-blue-500',
    titleColor: 'text-blue-600',
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    iconColor: 'text-amber-500',
    titleColor: 'text-amber-600',
  },
  tip: {
    icon: Lightbulb,
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    iconColor: 'text-green-500',
    titleColor: 'text-green-600',
  },
}

export function ContextualTip({
  id,
  type,
  title,
  description,
  suggestions,
  details,
  dismissible = true,
  className,
}: ContextualTipProps) {
  const { shouldShowTip, dismissTip } = useTips()
  const [showDetails, setShowDetails] = useState(false)
  const [isVisible, setIsVisible] = useState(true)

  // Check if tip was previously dismissed
  if (!shouldShowTip(id) || !isVisible) {
    return null
  }

  const config = typeConfig[type]
  const Icon = config.icon

  const handleDismiss = () => {
    setIsVisible(false)
  }

  const handleDontShowAgain = () => {
    dismissTip(id)
    setIsVisible(false)
  }

  return (
    <div
      className={cn(
        'border-brutal p-4',
        config.bgColor,
        config.borderColor,
        className
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', config.iconColor)} />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className={cn('text-sm font-medium', config.titleColor)}>
              {title}
            </p>
            {dismissible && (
              <button
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground transition-colors p-0.5 -mr-1 -mt-0.5"
                aria-label="Close tip"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">{description}</p>

          {suggestions && suggestions.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-1">
              {suggestions.map((suggestion, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className={config.iconColor}>•</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          )}

          {details && (
            <div className="pt-1">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showDetails ? (
                  <>
                    <ChevronUp className="h-3 w-3" />
                    Hide details
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    Learn more
                  </>
                )}
              </button>
              {showDetails && (
                <div className="mt-2 text-xs text-muted-foreground bg-background/50 p-3 border border-border">
                  {details}
                </div>
              )}
            </div>
          )}

          {dismissible && (
            <div className="pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDontShowAgain}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                Don't show again
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Wrench,
  SkipForward,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type { SSHConnectionTestResult } from '@/lib/ssh-service'
import {
  generateTroubleshootingSteps,
  executeFixAction,
  analyzeRootCause,
  type TroubleshootingStep,
  type PreflightResult,
} from '@/lib/diagnostic-engine'
import { cn } from '@/lib/utils'

interface TroubleshootingWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionResult: SSHConnectionTestResult
  preflightResult: PreflightResult | null
  onRetestConnection: () => Promise<SSHConnectionTestResult>
}

export function TroubleshootingWizard({
  open,
  onOpenChange,
  connectionResult,
  preflightResult,
  onRetestConnection,
}: TroubleshootingWizardProps) {
  const [steps, setSteps] = useState<TroubleshootingStep[]>(() =>
    generateTroubleshootingSteps(
      connectionResult.errorType,
      connectionResult.errorDetails,
      preflightResult
    )
  )
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [isExecuting, setIsExecuting] = useState(false)
  const [isRetesting, setIsRetesting] = useState(false)
  const [retestResult, setRetestResult] =
    useState<SSHConnectionTestResult | null>(null)

  const rootCause = analyzeRootCause(connectionResult, preflightResult || undefined)

  const currentStep = steps[currentStepIndex]
  const isLastStep = currentStepIndex === steps.length - 1
  const isFirstStep = currentStepIndex === 0

  const handleExecuteAction = async (actionId: string) => {
    if (!currentStep) return

    const action = currentStep.actions.find((a) => a.id === actionId)
    if (!action?.fixAction) return

    setIsExecuting(true)
    try {
      const result = await executeFixAction(action.fixAction)

      // Update the action as completed
      setSteps((prev) =>
        prev.map((step, idx) =>
          idx === currentStepIndex
            ? {
                ...step,
                actions: step.actions.map((a) =>
                  a.id === actionId ? { ...a, completed: true } : a
                ),
                status: result.success ? 'completed' : 'failed',
                result: result.message,
              }
            : step
        )
      )

      // Auto-advance if successful
      if (result.success && !isLastStep) {
        setCurrentStepIndex((prev) => prev + 1)
      }
    } catch (error) {
      console.error('Failed to execute action:', error)
    } finally {
      setIsExecuting(false)
    }
  }

  const handleSkip = () => {
    setSteps((prev) =>
      prev.map((step, idx) =>
        idx === currentStepIndex ? { ...step, status: 'skipped' } : step
      )
    )
    if (!isLastStep) {
      setCurrentStepIndex((prev) => prev + 1)
    }
  }

  const handleRetest = async () => {
    setIsRetesting(true)
    try {
      const result = await onRetestConnection()
      setRetestResult(result)

      if (result.success) {
        // Mark retest step as completed
        setSteps((prev) =>
          prev.map((step) =>
            step.id === 'retest' ? { ...step, status: 'completed' } : step
          )
        )
      }
    } catch (error) {
      console.error('Retest failed:', error)
    } finally {
      setIsRetesting(false)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    // Reset state
    setCurrentStepIndex(0)
    setRetestResult(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>SSH Connection Troubleshooting</DialogTitle>
          <DialogDescription>
            Let's fix the connection issue step by step.
          </DialogDescription>
        </DialogHeader>

        {/* Root Cause Summary */}
        <div className="rounded-lg bg-muted p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">{rootCause.likelyCause}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {rootCause.explanation}
              </p>
            </div>
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center gap-1 mb-4">
          {steps.map((step, idx) => (
            <div key={step.id} className="flex items-center">
              <div
                className={cn(
                  'h-2 w-2 rounded-full',
                  idx < currentStepIndex && 'bg-green-500',
                  idx === currentStepIndex && 'bg-primary',
                  idx > currentStepIndex && 'bg-muted-foreground/30',
                  step.status === 'failed' && 'bg-red-500',
                  step.status === 'skipped' && 'bg-muted-foreground/50'
                )}
              />
              {idx < steps.length - 1 && (
                <div className="w-4 h-0.5 bg-muted-foreground/30" />
              )}
            </div>
          ))}
        </div>

        {/* Current Step */}
        {currentStep && (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Step {currentStepIndex + 1} of {steps.length}
              </p>
              <h3 className="text-lg font-medium">{currentStep.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {currentStep.description}
              </p>
            </div>

            {/* Step Result */}
            {currentStep.result && (
              <div
                className={cn(
                  'rounded-md p-3 text-sm',
                  currentStep.status === 'completed' &&
                    'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400',
                  currentStep.status === 'failed' &&
                    'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                )}
              >
                {currentStep.result}
              </div>
            )}

            {/* Retest Result */}
            {currentStep.id === 'retest' && retestResult && (
              <div
                className={cn(
                  'rounded-md p-3',
                  retestResult.success
                    ? 'bg-green-50 dark:bg-green-950/30'
                    : 'bg-red-50 dark:bg-red-950/30'
                )}
              >
                <div className="flex items-center gap-2">
                  {retestResult.success ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <span
                    className={cn(
                      'text-sm font-medium',
                      retestResult.success ? 'text-green-700' : 'text-red-700'
                    )}
                  >
                    {retestResult.success
                      ? 'Connection successful!'
                      : 'Connection still failing'}
                  </span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              {currentStep.actions.map((action) => {
                if (action.type === 'auto' && action.fixAction) {
                  return (
                    <Button
                      key={action.id}
                      variant="default"
                      size="sm"
                      onClick={() => handleExecuteAction(action.id)}
                      disabled={isExecuting || action.completed}
                    >
                      {isExecuting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Running...
                        </>
                      ) : action.completed ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Done
                        </>
                      ) : (
                        <>
                          <Wrench className="h-4 w-4 mr-1" />
                          {action.label}
                        </>
                      )}
                    </Button>
                  )
                }

                if (action.id === 'retest-connection') {
                  return (
                    <Button
                      key={action.id}
                      variant="default"
                      size="sm"
                      onClick={handleRetest}
                      disabled={isRetesting}
                    >
                      {isRetesting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Test Connection
                        </>
                      )}
                    </Button>
                  )
                }

                return null
              })}

              {currentStep.id !== 'retest' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  disabled={isExecuting}
                >
                  <SkipForward className="h-4 w-4 mr-1" />
                  Skip
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentStepIndex((prev) => prev - 1)}
            disabled={isFirstStep}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          <div className="flex gap-2">
            {retestResult?.success ? (
              <Button size="sm" onClick={handleClose}>
                Done
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={handleClose}>
                  Close
                </Button>
                {!isLastStep && (
                  <Button
                    size="sm"
                    onClick={() => setCurrentStepIndex((prev) => prev + 1)}
                    disabled={isExecuting}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

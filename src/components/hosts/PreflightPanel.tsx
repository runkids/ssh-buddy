import { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Play,
  Wrench,
  SkipForward,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SSHHostConfig } from '@/lib/ssh-config'
import {
  runPreflightChecks,
  executeFixAction,
  type PreflightResult,
  type PreflightCheck,
} from '@/lib/diagnostic-engine'
import { cn } from '@/lib/utils'

interface PreflightPanelProps {
  host: SSHHostConfig
  onComplete?: (result: PreflightResult) => void
  onContinue?: () => void
}

export function PreflightPanel({
  host,
  onComplete,
  onContinue,
}: PreflightPanelProps) {
  const [result, setResult] = useState<PreflightResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [fixingId, setFixingId] = useState<string | null>(null)

  const handleRunChecks = async () => {
    setIsRunning(true)
    setResult(null)

    try {
      const checkResult = await runPreflightChecks(host)
      setResult(checkResult)
      onComplete?.(checkResult)
    } catch (error) {
      console.error('Pre-flight checks failed:', error)
    } finally {
      setIsRunning(false)
    }
  }

  const handleFix = async (check: PreflightCheck) => {
    if (!check.fixAction) return

    setFixingId(check.id)
    try {
      const fixResult = await executeFixAction(check.fixAction)
      if (fixResult.success) {
        // Re-run checks after fix
        await handleRunChecks()
      }
    } catch (error) {
      console.error('Fix failed:', error)
    } finally {
      setFixingId(null)
    }
  }

  const handleFixAll = async () => {
    if (!result) return

    const failedChecks = result.checks.filter(
      (c) => (c.status === 'failed' || c.status === 'warning') && c.fixAction
    )

    for (const check of failedChecks) {
      if (check.fixAction) {
        setFixingId(check.id)
        try {
          await executeFixAction(check.fixAction)
        } catch (error) {
          console.error(`Fix for ${check.id} failed:`, error)
        }
      }
    }

    setFixingId(null)
    // Re-run checks after all fixes
    await handleRunChecks()
  }

  const hasFixableIssues = result?.checks.some(
    (c) => (c.status === 'failed' || c.status === 'warning') && c.fixAction
  )

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">Pre-flight Checks</h3>
        <div className="flex gap-2">
          {result && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRunChecks}
              disabled={isRunning}
            >
              <RefreshCw
                className={cn('h-4 w-4 mr-1', isRunning && 'animate-spin')}
              />
              Re-run
            </Button>
          )}
          {!result && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunChecks}
              disabled={isRunning}
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  Run Checks
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Check Results */}
      {result && (
        <div className="space-y-2">
          {result.checks.map((check) => (
            <CheckRow
              key={check.id}
              check={check}
              isFixing={fixingId === check.id}
              onFix={() => handleFix(check)}
            />
          ))}

          {/* Summary and Actions */}
          <div className="flex items-center justify-between pt-3 mt-3 border-t">
            <div className="text-sm">
              {result.allPassed ? (
                <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  All checks passed
                </span>
              ) : result.hasErrors ? (
                <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                  <XCircle className="h-4 w-4" />
                  Some checks failed
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  Some warnings found
                </span>
              )}
            </div>

            <div className="flex gap-2">
              {hasFixableIssues && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFixAll}
                  disabled={!!fixingId}
                >
                  <Wrench className="h-4 w-4 mr-1" />
                  Fix All
                </Button>
              )}
              <Button
                size="sm"
                onClick={onContinue}
                disabled={!!fixingId}
              >
                {result.hasErrors ? (
                  <>
                    <SkipForward className="h-4 w-4 mr-1" />
                    Continue Anyway
                  </>
                ) : (
                  'Continue to Test'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Initial State */}
      {!result && !isRunning && (
        <p className="text-sm text-muted-foreground">
          Run pre-flight checks to verify your SSH configuration before testing
          the connection.
        </p>
      )}
    </div>
  )
}

interface CheckRowProps {
  check: PreflightCheck
  isFixing: boolean
  onFix: () => void
}

function CheckRow({ check, isFixing, onFix }: CheckRowProps) {
  const getStatusIcon = () => {
    switch (check.status) {
      case 'passed':
        return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      case 'checking':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
      case 'skipped':
        return <SkipForward className="h-4 w-4 text-muted-foreground" />
      default:
        return <div className="h-4 w-4 rounded-full border-2 border-muted" />
    }
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between py-2 px-3 rounded-md',
        check.status === 'failed' && 'bg-red-50 dark:bg-red-950/20',
        check.status === 'warning' && 'bg-amber-50 dark:bg-amber-950/20',
        check.status === 'passed' && 'bg-green-50 dark:bg-green-950/20',
        check.status === 'skipped' && 'bg-muted/50'
      )}
    >
      <div className="flex items-center gap-3">
        {getStatusIcon()}
        <div>
          <div className="text-sm font-medium">{check.name}</div>
          {check.message && (
            <div className="text-xs text-muted-foreground">{check.message}</div>
          )}
        </div>
      </div>

      {check.fixAction && (check.status === 'failed' || check.status === 'warning') && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onFix}
          disabled={isFixing}
          className="ml-2"
        >
          {isFixing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Wrench className="h-4 w-4 mr-1" />
              Fix
            </>
          )}
        </Button>
      )}
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Trash2,
  ChevronRight,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  runSecurityScan,
  getScanSummary,
  removeKnownHostEntry,
  type SecurityScanResult,
  type SecurityIssue,
  type KnownHostEntry,
} from '@/lib/security-checks'
import type { SSHKeyInfo } from '@/lib/ssh-service'
import { useToast } from '@/components/common'
import { cn } from '@/lib/utils'

interface SecurityPanelProps {
  keys: SSHKeyInfo[]
  onRefresh?: () => void
}

export function SecurityPanel({ keys, onRefresh }: SecurityPanelProps) {
  const [scanResult, setScanResult] = useState<SecurityScanResult | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['keys', 'hosts'])
  )
  const [deleteTarget, setDeleteTarget] = useState<KnownHostEntry | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const { addToast } = useToast()

  const runScan = useCallback(
    async (showToast = false) => {
      setIsScanning(true)

      // Minimum loading time for better UX (avoid flash)
      const minLoadingTime = showToast ? 600 : 0
      const startTime = Date.now()

      try {
        const result = await runSecurityScan(keys)

        // Wait for minimum loading time
        const elapsed = Date.now() - startTime
        if (elapsed < minLoadingTime) {
          await new Promise((r) => setTimeout(r, minLoadingTime - elapsed))
        }

        setScanResult(result)

        if (showToast) {
          const summary = getScanSummary(result)
          addToast({
            type: summary.status === 'healthy' ? 'success' : 'info',
            title: 'Scan Complete',
            description: summary.message,
          })
        }
      } catch (error) {
        console.error('Security scan failed:', error)

        // Wait for minimum loading time even on error
        const elapsed = Date.now() - startTime
        if (elapsed < minLoadingTime) {
          await new Promise((r) => setTimeout(r, minLoadingTime - elapsed))
        }

        if (showToast) {
          addToast({
            type: 'error',
            title: 'Scan Failed',
            description: 'Failed to complete security scan',
          })
        }
      } finally {
        setIsScanning(false)
      }
    },
    [keys, addToast]
  )

  useEffect(() => {
    runScan()
  }, [runScan])

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  const confirmRemoveKnownHost = async () => {
    if (!deleteTarget) return

    setIsDeleting(true)
    try {
      await removeKnownHostEntry(deleteTarget.lineNumber)
      await runScan()
      onRefresh?.()
    } catch (error) {
      console.error('Failed to remove known host:', error)
    } finally {
      setIsDeleting(false)
      setDeleteTarget(null)
    }
  }

  if (!scanResult) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 text-muted-foreground animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">Scanning...</p>
      </div>
    )
  }

  const summary = getScanSummary(scanResult)

  return (
    <div className="space-y-6">
      {/* Header - Sticky */}
      <div className="flex items-center justify-between sticky top-0 bg-background py-2 -mt-2 z-10">
        <div className="flex items-center gap-3">
          {summary.status === 'healthy' ? (
            <div className="flex h-10 w-10 items-center justify-center bg-success/10 border-2 border-success/30">
              <ShieldCheck className="h-5 w-5 text-success" />
            </div>
          ) : summary.status === 'error' ? (
            <div className="flex h-10 w-10 items-center justify-center bg-destructive/10 border-2 border-destructive/30">
              <ShieldAlert className="h-5 w-5 text-destructive" />
            </div>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center bg-amber-500/10 border-2 border-amber-500/30">
              <Shield className="h-5 w-5 text-amber-600" />
            </div>
          )}
          <div>
            <h3 className="font-medium">Security Status</h3>
            <p
              className={cn(
                'text-sm',
                summary.status === 'healthy'
                  ? 'text-success'
                  : summary.status === 'error'
                    ? 'text-destructive'
                    : 'text-amber-600'
              )}
            >
              {summary.message}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => runScan(true)}
          disabled={isScanning}
        >
          <RefreshCw
            className={cn('h-4 w-4 mr-2', isScanning && 'animate-spin')}
          />
          {isScanning ? 'Scanning...' : 'Rescan'}
        </Button>
      </div>

      {/* Key Health Section */}
      <section className="border-brutal border-primary/20 overflow-hidden shadow-brutal-dark-sm">
        <button
          onClick={() => toggleSection('keys')}
          className="flex w-full items-center justify-between p-4 hover:bg-primary/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <ChevronRight
              className={cn(
                'h-4 w-4 transition-transform',
                expandedSections.has('keys') && 'rotate-90'
              )}
            />
            <span className="font-medium">SSH Keys</span>
            <IssueCountBadge
              issues={scanResult.keyHealth.flatMap((kh) => kh.issues)}
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {scanResult.keyHealth.length} keys
          </span>
        </button>

        {expandedSections.has('keys') && (
          <div className="border-t-2 border-border divide-y divide-border">
            {scanResult.keyHealth.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No SSH keys found
              </p>
            ) : (
              scanResult.keyHealth.map((kh) => (
                <div key={kh.key.name} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm">{kh.key.name}</span>
                    {kh.isHealthy ? (
                      <span className="text-xs text-success flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        Healthy
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Issues found
                      </span>
                    )}
                  </div>
                  {kh.issues.length > 0 && (
                    <div className="space-y-2 mt-2">
                      {kh.issues.map((issue) => (
                        <IssueItem key={issue.id} issue={issue} />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {/* Known Hosts Section */}
      <section className="border-brutal border-primary/20 overflow-hidden shadow-brutal-dark-sm">
        <button
          onClick={() => toggleSection('hosts')}
          className="flex w-full items-center justify-between p-4 hover:bg-primary/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <ChevronRight
              className={cn(
                'h-4 w-4 transition-transform',
                expandedSections.has('hosts') && 'rotate-90'
              )}
            />
            <span className="font-medium">Known Hosts</span>
            <IssueCountBadge issues={scanResult.knownHosts.issues} />
          </div>
          <span className="text-sm text-muted-foreground">
            {scanResult.knownHosts.entries.length} entries
          </span>
        </button>

        {expandedSections.has('hosts') && (
          <div className="border-t-2 border-border">
            {/* Issues */}
            {scanResult.knownHosts.issues.length > 0 && (
              <div className="p-4 space-y-2 border-b-2 border-border bg-muted/30">
                {scanResult.knownHosts.issues.map((issue) => (
                  <IssueItem key={issue.id} issue={issue} />
                ))}
              </div>
            )}

            {/* Entries list */}
            <div className="divide-y divide-border">
              {scanResult.knownHosts.entries.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  No known hosts
                </p>
              ) : (
                scanResult.knownHosts.entries.map((entry) => (
                  <div
                    key={entry.lineNumber}
                    className="flex items-center justify-between p-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono truncate">
                        {entry.hosts.join(', ')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.keyType}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(entry)}
                      className="text-muted-foreground hover:text-destructive ml-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </section>

      {/* Last scan time */}
      <p className="text-xs text-muted-foreground text-center">
        Last scanned: {new Date(scanResult.timestamp).toLocaleString()}
      </p>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Known Host</DialogTitle>
            <DialogDescription className="pt-2">
              Are you sure you want to remove{' '}
              <span className="font-mono text-foreground">
                {deleteTarget?.hosts.join(', ')}
              </span>{' '}
              from your known_hosts file?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRemoveKnownHost}
              disabled={isDeleting}
            >
              {isDeleting ? 'Removing...' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface IssueItemProps {
  issue: SecurityIssue
}

function IssueItem({ issue }: IssueItemProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 p-2 text-sm border-l-2',
        issue.severity === 'error' && 'bg-destructive/10 border-destructive/50',
        issue.severity === 'warning' && 'bg-amber-500/10 border-amber-500/50',
        issue.severity === 'info' && 'bg-muted/50 border-muted-foreground/30'
      )}
    >
      {issue.severity === 'error' ? (
        <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
      ) : issue.severity === 'warning' ? (
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
      ) : (
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'font-medium',
            issue.severity === 'error' && 'text-destructive',
            issue.severity === 'warning' && 'text-amber-600',
            issue.severity === 'info' && 'text-muted-foreground'
          )}
        >
          {issue.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {issue.description}
        </p>
        {issue.suggestion && <p className="text-xs mt-1">{issue.suggestion}</p>}
      </div>
    </div>
  )
}

interface IssueCountBadgeProps {
  issues: SecurityIssue[]
}

function IssueCountBadge({ issues }: IssueCountBadgeProps) {
  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.filter((i) => i.severity === 'warning').length

  if (errors === 0 && warnings === 0) {
    return (
      <span className="px-1.5 py-0.5 bg-success/10 text-success text-xs border border-success/30">
        OK
      </span>
    )
  }

  return (
    <span
      className={cn(
        'px-1.5 py-0.5 text-xs border',
        errors > 0
          ? 'bg-destructive/10 text-destructive border-destructive/30'
          : 'bg-amber-500/10 text-amber-600 border-amber-500/30'
      )}
    >
      {errors > 0 ? errors : warnings}
    </span>
  )
}

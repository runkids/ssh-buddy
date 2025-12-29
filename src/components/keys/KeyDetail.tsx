import { useState, useEffect } from 'react'
import {
  Trash2,
  Copy,
  Check,
  Shield,
  FileKey,
  File,
  AlertCircle,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { Skeleton } from '@/components/common'
import type { SSHKeyInfo } from '@/lib/ssh-service'
import { getKeyTypeDisplayName } from '@/lib/ssh-service'
import { cn } from '@/lib/utils'

interface KeyDetailProps {
  keyInfo: SSHKeyInfo
  onDelete: () => void
  onGetPublicKey: () => Promise<string>
}

const keyTypeColors: Record<string, string> = {
  ed25519: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  rsa: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  ecdsa: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  dsa: 'text-red-400 bg-red-400/10 border-red-400/20',
  unknown: 'text-muted-foreground bg-muted border-border',
}

// Convert absolute path to ~/  format
function toShortPath(path: string): string {
  // Match /Users/username/ or /home/username/ pattern
  return path.replace(/^\/(?:Users|home)\/[^/]+\//, '~/')
}

export function KeyDetail({
  keyInfo,
  onDelete,
  onGetPublicKey,
}: KeyDetailProps) {
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedPath, setCopiedPath] = useState<'private' | 'public' | null>(
    null
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!keyInfo.hasPublicKey) return

    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)

      onGetPublicKey()
        .then((key) => {
          if (!cancelled) setPublicKey(key)
        })
        .catch((err) => {
          if (!cancelled) {
            setPublicKey(null)
            setError(
              err instanceof Error ? err.message : 'Failed to load public key'
            )
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    })

    return () => {
      cancelled = true
    }
  }, [keyInfo.name, keyInfo.hasPublicKey, onGetPublicKey])

  const copyPublicKey = async () => {
    if (!publicKey) return
    await navigator.clipboard.writeText(publicKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const copyPath = async (path: string, type: 'private' | 'public') => {
    await navigator.clipboard.writeText(toShortPath(path))
    setCopiedPath(type)
    setTimeout(() => setCopiedPath(null), 2000)
  }

  return (
    <div className="space-y-8 w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center bg-primary/10 border-brutal border-primary/40 shadow-brutal-sm">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-foreground">
                {keyInfo.name}
              </h2>
              <span
                className={cn(
                  'border-2 px-2.5 py-1 text-xs font-semibold uppercase',
                  keyTypeColors[keyInfo.type] || keyTypeColors.unknown
                )}
              >
                {getKeyTypeDisplayName(keyInfo.type)}
              </span>
            </div>
            {keyInfo.comment && (
              <p className="text-muted-foreground mt-1">{keyInfo.comment}</p>
            )}
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={onDelete}
              className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/50"
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete Key</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Delete Key</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* File Paths */}
      <div className="space-y-3">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          File Location
        </h3>
        <div className="border-brutal border-primary/20 overflow-hidden shadow-brutal-dark-sm">
          {/* Private Key Path */}
          <button
            onClick={() => copyPath(keyInfo.privateKeyPath, 'private')}
            className="flex items-center gap-3 px-4 py-3 border-b-2 border-border w-full text-left hover:bg-primary/5 transition-colors group"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-muted border-2 border-primary/15 group-hover:bg-primary/10 transition-colors">
              <FileKey className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Private Key</p>
              <p className="text-sm font-mono text-foreground truncate">
                {toShortPath(keyInfo.privateKeyPath)}
              </p>
            </div>
            <div className="shrink-0 text-muted-foreground group-hover:text-primary transition-colors">
              {copiedPath === 'private' ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </div>
          </button>
          {/* Public Key Path */}
          <button
            onClick={() =>
              keyInfo.hasPublicKey && copyPath(keyInfo.publicKeyPath, 'public')
            }
            disabled={!keyInfo.hasPublicKey}
            className={cn(
              'flex items-center gap-3 px-4 py-3 w-full text-left transition-colors group',
              keyInfo.hasPublicKey && 'hover:bg-primary/5'
            )}
          >
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center bg-muted border-2 border-primary/15 transition-colors',
                keyInfo.hasPublicKey && 'group-hover:bg-primary/10'
              )}
            >
              <File
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-colors',
                  keyInfo.hasPublicKey && 'group-hover:text-primary'
                )}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Public Key</p>
              <p
                className={cn(
                  'text-sm font-mono truncate',
                  keyInfo.hasPublicKey
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {keyInfo.hasPublicKey
                  ? toShortPath(keyInfo.publicKeyPath)
                  : 'Public key file not found'}
              </p>
            </div>
            {keyInfo.hasPublicKey && (
              <div className="shrink-0 text-muted-foreground group-hover:text-primary transition-colors">
                {copiedPath === 'public' ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Public Key Content */}
      {keyInfo.hasPublicKey && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Public Key Content
            </h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={copyPublicKey}
              disabled={!publicKey || loading}
              className={cn(
                'gap-2 transition-colors',
                copied && 'bg-success/20 text-success hover:bg-success/20'
              )}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy Public Key
                </>
              )}
            </Button>
          </div>

          <div className="border-brutal border-primary/20 bg-card overflow-hidden shadow-brutal-dark-sm">
            {loading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : error ? (
              <div className="flex items-center gap-3 p-4 text-destructive">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            ) : publicKey ? (
              <pre className="p-4 text-xs font-mono text-foreground/90 whitespace-pre-wrap break-all overflow-x-auto max-h-32">
                {publicKey}
              </pre>
            ) : (
              <div className="flex items-center gap-3 p-4 text-muted-foreground">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p className="text-sm">Unable to load public key content</p>
              </div>
            )}
          </div>

          {/* Usage hint */}
          <div className="flex items-start gap-3 bg-muted/50 p-4 border-brutal border-primary/15">
            <Info className="h-5 w-5 shrink-0 text-primary mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">
                How to use this public key
              </p>
              <ul className="space-y-1 list-disc list-inside">
                <li>
                  Add the public key to the server's{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 border border-border">
                    ~/.ssh/authorized_keys
                  </code>{' '}
                  file
                </li>
                <li>Or add it to the SSH Keys settings on GitHub/GitLab</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Warning for missing public key */}
      {!keyInfo.hasPublicKey && (
        <div className="flex items-start gap-3 border-brutal border-warning/50 bg-warning/5 p-4 shadow-brutal-warning">
          <AlertCircle className="h-5 w-5 shrink-0 text-warning mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-warning mb-1">
              Public key file not found
            </p>
            <p className="text-muted-foreground">
              The public key file (.pub) for this key does not exist. You may
              need to regenerate the key pair, or use ssh-keygen to regenerate
              the public key from the private key.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

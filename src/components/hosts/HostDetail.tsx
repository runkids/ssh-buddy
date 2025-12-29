import {
  Pencil,
  Trash2,
  Terminal,
  Copy,
  Check,
  Server,
  User,
  Globe,
  Key,
  Network,
  FileKey,
  Star,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  KeyRound,
  Ban,
  Clock,
  Globe2,
  ShieldQuestion,
  Plus,
  Lock,
  KeySquare,
  ShieldAlert,
  FileQuestion,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { TagManager } from './TagManager'
import type { SSHHostConfig } from '@/lib/ssh-config'
import type { HostMetadata } from '@/lib/metadata-service'
import {
  testSSHConnection,
  removeKnownHost,
  addKnownHost,
  addKeyToAgent,
  type SSHConnectionTestResult,
  type SSHErrorType,
} from '@/lib/ssh-service'
import { fixKeyPermissions } from '@/lib/platform-utils'
import { PreflightPanel } from './PreflightPanel'
import { cn } from '@/lib/utils'
import { ContextualTip } from '@/components/common/ContextualTip'
import {
  HOST_KEY_CHANGED_TIP,
  HOST_KEY_UNKNOWN_TIP,
  PERMISSION_DENIED_TIP,
} from '@/lib/guidance-tips'

interface HostDetailProps {
  host: SSHHostConfig
  onEdit: () => void
  onDelete: () => void
  // Metadata integration
  metadata?: HostMetadata | null
  allTags?: string[]
  onToggleFavorite?: () => Promise<void>
  onAddTag?: (tag: string) => Promise<void>
  onRemoveTag?: (tag: string) => Promise<void>
  onCreateTag?: (tag: string) => Promise<void>
  onDeleteTag?: (tag: string) => Promise<void>
}

// Map of SSH config keys to display info
const configDisplayInfo: Record<
  string,
  {
    label: string
    icon: typeof Server
    category: 'connection' | 'auth' | 'other'
  }
> = {
  HostName: { label: 'Host Address', icon: Globe, category: 'connection' },
  User: { label: 'Username', icon: User, category: 'connection' },
  Port: { label: 'Port', icon: Network, category: 'connection' },
  IdentityFile: { label: 'Identity File', icon: FileKey, category: 'auth' },
  IdentitiesOnly: { label: 'Identities Only', icon: Key, category: 'auth' },
  ProxyJump: { label: 'Jump Host', icon: Server, category: 'connection' },
  ProxyCommand: {
    label: 'Proxy Command',
    icon: Terminal,
    category: 'connection',
  },
  ForwardAgent: { label: 'Forward Agent', icon: Key, category: 'auth' },
  AddKeysToAgent: { label: 'Add Keys to Agent', icon: Key, category: 'auth' },
  UseKeychain: { label: 'Use Keychain', icon: Key, category: 'auth' },
  ServerAliveInterval: {
    label: 'Keep Alive Interval',
    icon: Network,
    category: 'other',
  },
  ServerAliveCountMax: {
    label: 'Keep Alive Count',
    icon: Network,
    category: 'other',
  },
  StrictHostKeyChecking: {
    label: 'Strict Host Key Checking',
    icon: Key,
    category: 'auth',
  },
  Compression: { label: 'Compression', icon: Network, category: 'other' },
}

export function HostDetail({
  host,
  onEdit,
  onDelete,
  metadata,
  allTags = [],
  onToggleFavorite,
  onAddTag,
  onRemoveTag,
  onCreateTag,
  onDeleteTag,
}: HostDetailProps) {
  const [copied, setCopied] = useState(false)
  const [isFavoriteLoading, setIsFavoriteLoading] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isRemovingHost, setIsRemovingHost] = useState(false)
  const [isAddingHost, setIsAddingHost] = useState(false)
  const [isFixingPermissions, setIsFixingPermissions] = useState(false)
  const [isAddingToAgent, setIsAddingToAgent] = useState(false)
  const [showPreflight, setShowPreflight] = useState(false)
  const [testResult, setTestResult] = useState<SSHConnectionTestResult | null>(
    null
  )

  // Clear test result and preflight when host changes
  useEffect(() => {
    setTestResult(null)
    setShowPreflight(false)
  }, [host.Host])

  const handleRemoveKnownHost = async () => {
    if (!testResult?.hostToRemove) return
    setIsRemovingHost(true)
    try {
      await removeKnownHost(testResult.hostToRemove)
      // Clear result and re-test
      setTestResult(null)
      // Auto re-test after removing
      handleTestConnection()
    } catch (error) {
      console.error('Failed to remove known host:', error)
    } finally {
      setIsRemovingHost(false)
    }
  }

  const handleAddKnownHost = async () => {
    if (!testResult?.hostToAdd) return
    setIsAddingHost(true)
    try {
      await addKnownHost(testResult.hostToAdd)
      // Clear result and re-test
      setTestResult(null)
      // Auto re-test after adding
      handleTestConnection()
    } catch (error) {
      console.error('Failed to add known host:', error)
    } finally {
      setIsAddingHost(false)
    }
  }

  const handleFixPermissions = async () => {
    const keyPath = testResult?.errorDetails?.fixParams?.keyPath
    if (!keyPath) return

    setIsFixingPermissions(true)
    try {
      const result = await fixKeyPermissions(keyPath)
      if (result.success) {
        // Clear result and re-test
        setTestResult(null)
        handleTestConnection()
      }
    } catch (error) {
      console.error('Failed to fix permissions:', error)
    } finally {
      setIsFixingPermissions(false)
    }
  }

  const handleAddToAgent = async () => {
    const keyPath =
      testResult?.errorDetails?.fixParams?.keyPath || host.IdentityFile
    if (!keyPath) return

    setIsAddingToAgent(true)
    try {
      const result = await addKeyToAgent(keyPath)
      if (result.success) {
        // Clear result and re-test
        setTestResult(null)
        handleTestConnection()
      } else if (result.needsPassphrase) {
        // Show message that user needs to run ssh-add manually
        console.log('Key requires passphrase - user needs to run ssh-add manually')
      }
    } catch (error) {
      console.error('Failed to add key to agent:', error)
    } finally {
      setIsAddingToAgent(false)
    }
  }

  const sshCommand = `ssh ${host.Host}`

  const copyCommand = async () => {
    await navigator.clipboard.writeText(sshCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const result = await testSSHConnection(host.Host, host.HostName)
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        output: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleToggleFavorite = async () => {
    if (!onToggleFavorite) return
    setIsFavoriteLoading(true)
    try {
      await onToggleFavorite()
    } finally {
      setIsFavoriteLoading(false)
    }
  }

  // Group options by category
  const options = Object.entries(host)
    .filter(
      ([key, value]) => key !== 'Host' && value !== undefined && value !== ''
    )
    .map(([key, value]) => ({
      key,
      value,
      ...configDisplayInfo[key],
    }))

  const connectionOptions = options.filter((o) => o.category === 'connection')
  const authOptions = options.filter((o) => o.category === 'auth')
  const otherOptions = options.filter(
    (o) => o.category === 'other' || !o.category
  )

  const formatValue = (value: unknown): string => {
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No'
    }
    return String(value)
  }

  const isFavorite = metadata?.isFavorite ?? false

  return (
    <div className="space-y-8 w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 relative">
            <Server className="h-7 w-7 text-primary" />
            {isFavorite && (
              <Star className="absolute -top-1 -right-1 h-5 w-5 fill-amber-500 text-amber-500" />
            )}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">{host.Host}</h2>
            {host.HostName && (
              <p className="text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <Globe className="h-4 w-4" />
                {host.HostName}
                {host.Port && host.Port !== 22 && (
                  <span className="text-muted-foreground/70">:{host.Port}</span>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-1.5">
          {onToggleFavorite && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleToggleFavorite}
                  disabled={isFavoriteLoading}
                  className={cn(
                    'h-9 w-9',
                    isFavorite &&
                      'text-amber-600 border-amber-500/30 bg-amber-500/10'
                  )}
                >
                  <Star
                    className={cn('h-4 w-4', isFavorite && 'fill-amber-500')}
                  />
                  <span className="sr-only">
                    {isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>
                  {isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                </p>
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={onEdit}
                className="h-9 w-9"
              >
                <Pencil className="h-4 w-4" />
                <span className="sr-only">Edit Host</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Edit Host</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={onDelete}
                className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/50"
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Delete Host</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Delete Host</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Tags Section */}
      {(onAddTag || (metadata && metadata.tags.length > 0)) && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Star className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground mb-1.5">Tags</p>
              {onAddTag && onRemoveTag ? (
                <TagManager
                  hostAlias={host.Host}
                  hostTags={metadata?.tags || []}
                  allTags={allTags}
                  onAddTag={onAddTag}
                  onRemoveTag={onRemoveTag}
                  onCreateTag={onCreateTag}
                  onDeleteTag={onDeleteTag}
                />
              ) : (
                <div className="flex flex-wrap gap-1">
                  {metadata?.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pre-flight Checks Panel */}
      {showPreflight && (
        <PreflightPanel
          host={host}
          onComplete={() => {}}
          onContinue={() => {
            setShowPreflight(false)
            handleTestConnection()
          }}
        />
      )}

      {/* Quick Connect Command */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Terminal className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground mb-1">
                Quick Connect
              </p>
              <code className="text-sm font-mono text-foreground">
                {sshCommand}
              </code>
            </div>
          </div>
          <div className="flex gap-2">
            {!showPreflight && host.IdentityFile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreflight(true)}
                className="gap-2 text-muted-foreground"
              >
                Pre-flight
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="gap-2"
            >
              {isTesting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Testing
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Test
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={copyCommand}
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
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Connection Test Result */}
        {testResult && (
          <ConnectionTestResult
            result={testResult}
            onRemoveKnownHost={handleRemoveKnownHost}
            onAddKnownHost={handleAddKnownHost}
            onFixPermissions={handleFixPermissions}
            onAddToAgent={handleAddToAgent}
            isRemovingHost={isRemovingHost}
            isAddingHost={isAddingHost}
            isFixingPermissions={isFixingPermissions}
            isAddingToAgent={isAddingToAgent}
          />
        )}
      </div>

      {/* Last Used Info */}
      {metadata?.lastUsed && (
        <div className="text-xs text-muted-foreground">
          Last used: {new Date(metadata.lastUsed).toLocaleString()}
        </div>
      )}

      {/* Configuration Details */}
      <div className="space-y-6">
        {/* Connection Settings */}
        {connectionOptions.length > 0 && (
          <ConfigSection
            title="Connection"
            options={connectionOptions}
            formatValue={formatValue}
          />
        )}

        {/* Authentication Settings */}
        {authOptions.length > 0 && (
          <ConfigSection
            title="Authentication"
            options={authOptions}
            formatValue={formatValue}
          />
        )}

        {/* Other Settings */}
        {otherOptions.length > 0 && (
          <ConfigSection
            title="Other"
            options={otherOptions}
            formatValue={formatValue}
          />
        )}

        {/* Empty state */}
        {options.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-muted-foreground">
              No additional options configured
            </p>
            <Button variant="link" onClick={onEdit} className="mt-2">
              Click to add settings
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// Error type configurations for friendly messages
const errorConfigs: Record<
  SSHErrorType,
  {
    icon: typeof AlertTriangle
    title: string
    description: string
    suggestions: string[]
    canFix?: boolean
    canAdd?: boolean
  }
> = {
  host_key_changed: {
    icon: AlertTriangle,
    title: 'Host Key Changed',
    description:
      "The remote host's identification key has changed. This usually happens when:",
    suggestions: [
      'The server was reinstalled or updated',
      'The platform rotated their SSH keys',
    ],
    canFix: true,
  },
  host_key_unknown: {
    icon: ShieldQuestion,
    title: 'Unknown Host',
    description:
      "This is the first time connecting to this server. SSH needs to verify the server's identity.",
    suggestions: [
      'This is normal for first-time connections',
      'The host key will be saved for future verification',
    ],
    canAdd: true,
  },
  permission_denied: {
    icon: KeyRound,
    title: 'Authentication Failed',
    description: 'The server rejected your SSH key. Please check:',
    suggestions: [
      'The correct IdentityFile is configured for this host',
      'Your public key is added to the remote service',
      'The key file permissions are correct (600)',
    ],
  },
  connection_refused: {
    icon: Ban,
    title: 'Connection Refused',
    description: 'Could not connect to the server. Possible causes:',
    suggestions: [
      "The server's SSH service is not running",
      'A firewall is blocking the connection',
      'The port number is incorrect',
    ],
  },
  timeout: {
    icon: Clock,
    title: 'Connection Timed Out',
    description: 'The connection attempt timed out. Please check:',
    suggestions: [
      'Your network connection',
      'The HostName is correct',
      'The server is online and reachable',
    ],
  },
  dns_failed: {
    icon: Globe2,
    title: 'Hostname Not Found',
    description: 'Could not resolve the hostname. Please check:',
    suggestions: [
      'The HostName is spelled correctly',
      'Your DNS/network connection is working',
    ],
  },
  unknown: {
    icon: XCircle,
    title: 'Connection Failed',
    description: 'An unexpected error occurred.',
    suggestions: [],
  },
  // Extended error types for enhanced diagnostics
  permission_denied_key_permissions: {
    icon: Lock,
    title: 'Key Permission Issue',
    description:
      'Your private key file permissions are too open. SSH refuses to use it for security reasons.',
    suggestions: [
      'Private keys should have 600 permissions (owner read/write only)',
      'Run: chmod 600 ~/.ssh/your_key',
    ],
    canFix: true,
  },
  permission_denied_key_not_in_agent: {
    icon: KeySquare,
    title: 'Key Not in SSH Agent',
    description:
      'No keys are loaded in your SSH agent. The key may require a passphrase.',
    suggestions: [
      'Add your key to the SSH agent: ssh-add ~/.ssh/your_key',
      'If using macOS Keychain: ssh-add --apple-use-keychain ~/.ssh/your_key',
    ],
    canFix: true,
  },
  permission_denied_wrong_key: {
    icon: KeyRound,
    title: 'Wrong Key Used',
    description:
      'Multiple keys were tried but none were accepted by the server.',
    suggestions: [
      'Verify the correct IdentityFile is configured for this host',
      'Check that your public key is added to the remote service',
      'Try using IdentitiesOnly yes in your SSH config',
    ],
  },
  permission_denied_passphrase: {
    icon: KeySquare,
    title: 'Passphrase Required',
    description:
      'Your key requires a passphrase, but the connection test cannot prompt for it.',
    suggestions: [
      'Add your key to the SSH agent first',
      'The passphrase will be stored securely in the agent',
    ],
    canFix: true,
  },
  permission_denied_auth_method: {
    icon: ShieldAlert,
    title: 'Authentication Method Not Accepted',
    description:
      'The server does not accept public key authentication or your key type.',
    suggestions: [
      'Check if the server allows publickey authentication',
      'Your key algorithm may not be supported by the server',
      'Try generating a new Ed25519 key',
    ],
  },
  identity_file_not_found: {
    icon: FileQuestion,
    title: 'Identity File Not Found',
    description: 'The configured identity file does not exist.',
    suggestions: [
      'Check the IdentityFile path in your SSH config',
      'The key may have been deleted or moved',
      'Generate a new key if needed',
    ],
  },
  public_key_missing: {
    icon: FileQuestion,
    title: 'Public Key Missing',
    description: 'The public key file (.pub) is missing for your private key.',
    suggestions: [
      'Regenerate the public key: ssh-keygen -y -f ~/.ssh/your_key > ~/.ssh/your_key.pub',
      'Or generate a new key pair',
    ],
  },
}

interface ConnectionTestResultProps {
  result: SSHConnectionTestResult
  onRemoveKnownHost: () => void
  onAddKnownHost: () => void
  onFixPermissions: () => void
  onAddToAgent: () => void
  isRemovingHost: boolean
  isAddingHost: boolean
  isFixingPermissions: boolean
  isAddingToAgent: boolean
}

// Helper component to show identity file info
function IdentityFileInfo({ identityFile }: { identityFile?: string }) {
  if (!identityFile) return null
  // Extract just the filename from the path
  const keyName = identityFile.split('/').pop() || identityFile
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
      <Key className="h-3 w-3" />
      <span>
        Key used: <code className="bg-muted px-1 rounded">{keyName}</code>
      </span>
    </div>
  )
}

function ConnectionTestResult({
  result,
  onRemoveKnownHost,
  onAddKnownHost,
  onFixPermissions,
  onAddToAgent,
  isRemovingHost,
  isAddingHost,
  isFixingPermissions,
  isAddingToAgent,
}: ConnectionTestResultProps) {
  // Success case
  if (result.success) {
    return (
      <div className="border-t p-4 bg-success/10 border-success/30">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium mb-2 text-success">
              Connection Successful
            </p>
            <pre className="text-xs font-mono bg-background/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
              {result.output}
            </pre>
            <IdentityFileInfo identityFile={result.identityFile} />
            {result.debugLog && (
              <details className="text-xs mt-3">
                <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                  Show debug log
                </summary>
                <pre className="font-mono bg-background/50 rounded-lg p-3 mt-2 overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                  {result.debugLog}
                </pre>
              </details>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Error case with friendly message
  const errorType = result.errorType || 'unknown'
  const config = errorConfigs[errorType]
  const Icon = config.icon

  return (
    <div className="border-t p-4 bg-amber-500/10 border-amber-500/30">
      <div className="flex items-start gap-3">
        <Icon className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-medium text-amber-500">{config.title}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {config.description}
            </p>
            {config.suggestions.length > 0 && (
              <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                {config.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-amber-500">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Show which key was used (helpful for debugging) */}
          <IdentityFileInfo identityFile={result.identityFile} />

          {/* Fix button for host_key_changed */}
          {config.canFix && result.hostToRemove && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground mb-2">
                This won't affect your SSH keys or account settings.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={onRemoveKnownHost}
                disabled={isRemovingHost}
                className="gap-2 border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
              >
                {isRemovingHost ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Removing...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Remove Old Host Key
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Add button for host_key_unknown */}
          {config.canAdd && result.hostToAdd && (
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onAddKnownHost}
                disabled={isAddingHost}
                className="gap-2 border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
              >
                {isAddingHost ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add to Known Hosts
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Fix button for permission issues */}
          {errorType === 'permission_denied_key_permissions' &&
            result.errorDetails?.fixParams?.keyPath && (
              <div className="pt-2">
                <p className="text-xs text-muted-foreground mb-2">
                  This will set file permissions to 600 (owner read/write only).
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onFixPermissions}
                  disabled={isFixingPermissions}
                  className="gap-2 border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                >
                  {isFixingPermissions ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Fixing...
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      Fix Permissions
                    </>
                  )}
                </Button>
              </div>
            )}

          {/* Fix button for key not in agent / passphrase issues */}
          {(errorType === 'permission_denied_key_not_in_agent' ||
            errorType === 'permission_denied_passphrase') &&
            config.canFix && (
              <div className="pt-2">
                <p className="text-xs text-muted-foreground mb-2">
                  Add your key to the SSH agent. If it has a passphrase, you may
                  need to run ssh-add manually in terminal.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAddToAgent}
                  disabled={isAddingToAgent}
                  className="gap-2 border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                >
                  {isAddingToAgent ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <KeySquare className="h-4 w-4" />
                      Add to SSH Agent
                    </>
                  )}
                </Button>
              </div>
            )}

          {/* Educational tips for specific error types */}
          {errorType === 'host_key_changed' && (
            <ContextualTip
              id={HOST_KEY_CHANGED_TIP.id}
              type={HOST_KEY_CHANGED_TIP.type}
              title={HOST_KEY_CHANGED_TIP.title}
              description={HOST_KEY_CHANGED_TIP.description}
              suggestions={HOST_KEY_CHANGED_TIP.suggestions}
              details={HOST_KEY_CHANGED_TIP.details}
              className="mt-3"
            />
          )}
          {errorType === 'host_key_unknown' && (
            <ContextualTip
              id={HOST_KEY_UNKNOWN_TIP.id}
              type={HOST_KEY_UNKNOWN_TIP.type}
              title={HOST_KEY_UNKNOWN_TIP.title}
              description={HOST_KEY_UNKNOWN_TIP.description}
              suggestions={HOST_KEY_UNKNOWN_TIP.suggestions}
              details={HOST_KEY_UNKNOWN_TIP.details}
              className="mt-3"
            />
          )}
          {errorType === 'permission_denied' && (
            <ContextualTip
              id={PERMISSION_DENIED_TIP.id}
              type={PERMISSION_DENIED_TIP.type}
              title={PERMISSION_DENIED_TIP.title}
              description={PERMISSION_DENIED_TIP.description}
              suggestions={PERMISSION_DENIED_TIP.suggestions}
              details={PERMISSION_DENIED_TIP.details}
              className="mt-3"
            />
          )}

          {/* Debug log (collapsed by default) */}
          <details className="text-xs">
            <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
              Show debug log
            </summary>
            <pre className="font-mono bg-background/50 rounded-lg p-3 mt-2 overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
              {result.debugLog || result.output}
            </pre>
          </details>
        </div>
      </div>
    </div>
  )
}

interface ConfigSectionProps {
  title: string
  options: Array<{
    key: string
    value: unknown
    label?: string
    icon?: typeof Server
  }>
  formatValue: (value: unknown) => string
}

function ConfigSection({ title, options, formatValue }: ConfigSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      <div className="rounded-xl border border-border overflow-hidden">
        {options.map(({ key, value, label, icon: Icon }, index) => (
          <div
            key={key}
            className={cn(
              'flex items-center gap-3 px-4 py-3',
              index !== options.length - 1 && 'border-b border-border'
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
              {Icon ? (
                <Icon className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Server className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">{label || key}</p>
              <p className="text-sm font-mono text-foreground truncate">
                {formatValue(value)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

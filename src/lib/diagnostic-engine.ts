/**
 * Diagnostic Engine
 * Core module for SSH connection diagnostics and troubleshooting
 */

import { exists } from '@tauri-apps/plugin-fs'
import type { SSHHostConfig } from './ssh-config'
import {
  type SSHConnectionTestResult,
  type SSHErrorType,
  type SSHErrorDetails,
  isKeyInAgent,
  isAgentRunning,
  addKeyToAgent,
  getSSHDir,
} from './ssh-service'
import {
  checkKeyPermissions,
  fixKeyPermissions,
  type PermissionCheckResult,
} from './platform-utils'

// ============================================================
// Types
// ============================================================

/**
 * Pre-flight check types
 */
export type PreflightCheckType =
  | 'identity_file_exists'
  | 'public_key_exists'
  | 'identity_file_permissions'
  | 'key_in_agent'
  | 'agent_running'

/**
 * Fix action types
 */
export type DiagnosticFixType =
  | 'chmod'
  | 'ssh-add'
  | 'copy-pubkey'
  | 'remove-known-host'
  | 'add-known-host'
  | 'generate-key'

/**
 * Fix action definition
 */
export interface DiagnosticFixAction {
  id: string
  label: string
  description: string
  type: DiagnosticFixType
  params?: Record<string, string>
}

/**
 * Pre-flight check item
 */
export interface PreflightCheck {
  id: PreflightCheckType
  name: string
  description: string
  status: 'pending' | 'checking' | 'passed' | 'failed' | 'warning' | 'skipped'
  message?: string
  fixAction?: DiagnosticFixAction
}

/**
 * Pre-flight check result
 */
export interface PreflightResult {
  checks: PreflightCheck[]
  allPassed: boolean
  hasWarnings: boolean
  hasErrors: boolean
  timestamp: number
}

/**
 * Troubleshooting step
 */
export interface TroubleshootingStep {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed'
  actions: TroubleshootingAction[]
  result?: string
}

/**
 * Troubleshooting action
 */
export interface TroubleshootingAction {
  id: string
  label: string
  type: 'auto' | 'manual' | 'info'
  fixAction?: DiagnosticFixAction
  completed: boolean
}

/**
 * Root cause analysis result
 */
export interface RootCauseAnalysis {
  likelyCause: string
  confidence: 'high' | 'medium' | 'low'
  explanation: string
  relatedIssues: string[]
}

/**
 * Diagnostic session
 */
export interface DiagnosticSession {
  hostAlias: string
  hostConfig: SSHHostConfig
  preflight: PreflightResult | null
  connectionResult: SSHConnectionTestResult | null
  troubleshootingSteps: TroubleshootingStep[]
  currentStep: number
  status: 'idle' | 'preflight' | 'testing' | 'troubleshooting' | 'complete'
}

// ============================================================
// Pre-flight Checks
// ============================================================

/**
 * Run all pre-flight checks for a host
 */
export async function runPreflightChecks(
  host: SSHHostConfig
): Promise<PreflightResult> {
  const checks: PreflightCheck[] = []
  const sshDir = await getSSHDir()

  // Get identity file path
  const identityFile = host.IdentityFile
  const identityPath = identityFile
    ? identityFile.startsWith('~')
      ? identityFile.replace('~', sshDir.replace('/.ssh', ''))
      : identityFile
    : null

  // Check 1: Agent running
  checks.push(await checkAgentRunning())

  // Check 2: Identity file exists (if configured)
  if (identityPath) {
    checks.push(await checkIdentityFileExists(identityPath))

    // Check 3: Public key exists
    checks.push(await checkPublicKeyExists(identityPath))

    // Check 4: Identity file permissions
    checks.push(await checkIdentityFilePermissions(identityPath))

    // Check 5: Key in agent
    checks.push(await checkKeyInAgentStatus(identityPath))
  } else {
    // No identity file configured - skip key-specific checks
    checks.push({
      id: 'identity_file_exists',
      name: 'Identity File',
      description: 'No specific identity file configured',
      status: 'skipped',
      message: 'Using default SSH key discovery',
    })
  }

  const hasErrors = checks.some((c) => c.status === 'failed')
  const hasWarnings = checks.some((c) => c.status === 'warning')
  const allPassed = !hasErrors && !hasWarnings

  return {
    checks,
    allPassed,
    hasWarnings,
    hasErrors,
    timestamp: Date.now(),
  }
}

async function checkAgentRunning(): Promise<PreflightCheck> {
  const running = await isAgentRunning()
  return {
    id: 'agent_running',
    name: 'SSH Agent',
    description: 'Check if SSH agent is running',
    status: running ? 'passed' : 'warning',
    message: running
      ? 'SSH agent is running'
      : 'SSH agent may not be running. Keys with passphrases may not work.',
  }
}

async function checkIdentityFileExists(
  identityPath: string
): Promise<PreflightCheck> {
  const fileExists = await exists(identityPath)
  return {
    id: 'identity_file_exists',
    name: 'Identity File',
    description: 'Check if the configured identity file exists',
    status: fileExists ? 'passed' : 'failed',
    message: fileExists
      ? `Found: ${identityPath.split('/').pop()}`
      : `File not found: ${identityPath}`,
    fixAction: fileExists
      ? undefined
      : {
          id: 'generate-key',
          label: 'Generate New Key',
          description: 'Create a new SSH key pair',
          type: 'generate-key',
          params: { keyPath: identityPath },
        },
  }
}

async function checkPublicKeyExists(
  identityPath: string
): Promise<PreflightCheck> {
  const pubKeyPath = `${identityPath}.pub`
  const fileExists = await exists(pubKeyPath)
  return {
    id: 'public_key_exists',
    name: 'Public Key',
    description: 'Check if the public key file exists',
    status: fileExists ? 'passed' : 'warning',
    message: fileExists
      ? `Found: ${pubKeyPath.split('/').pop()}`
      : 'Public key file (.pub) is missing. You can regenerate it from the private key.',
  }
}

async function checkIdentityFilePermissions(
  identityPath: string
): Promise<PreflightCheck> {
  try {
    const permResult: PermissionCheckResult =
      await checkKeyPermissions(identityPath)

    if (permResult.isSecure) {
      return {
        id: 'identity_file_permissions',
        name: 'Key Permissions',
        description: 'Check if key file permissions are secure',
        status: 'passed',
        message: `Permissions: ${permResult.currentMode || 'secure'}`,
      }
    }

    return {
      id: 'identity_file_permissions',
      name: 'Key Permissions',
      description: 'Check if key file permissions are secure',
      status: 'failed',
      message: permResult.message,
      fixAction: permResult.canFix
        ? {
            id: 'fix-permissions',
            label: 'Fix Permissions',
            description: `Set permissions to ${permResult.requiredMode}`,
            type: 'chmod',
            params: { keyPath: identityPath },
          }
        : undefined,
    }
  } catch (error) {
    return {
      id: 'identity_file_permissions',
      name: 'Key Permissions',
      description: 'Check if key file permissions are secure',
      status: 'warning',
      message: 'Could not check permissions',
    }
  }
}

async function checkKeyInAgentStatus(
  identityPath: string
): Promise<PreflightCheck> {
  try {
    const inAgent = await isKeyInAgent(identityPath)
    return {
      id: 'key_in_agent',
      name: 'Key in Agent',
      description: 'Check if the key is loaded in SSH agent',
      status: inAgent ? 'passed' : 'warning',
      message: inAgent
        ? 'Key is loaded in SSH agent'
        : 'Key is not loaded in SSH agent. Passphrase may be required.',
      fixAction: inAgent
        ? undefined
        : {
            id: 'add-to-agent',
            label: 'Add to Agent',
            description: 'Load the key into SSH agent',
            type: 'ssh-add',
            params: { keyPath: identityPath },
          },
    }
  } catch (error) {
    return {
      id: 'key_in_agent',
      name: 'Key in Agent',
      description: 'Check if the key is loaded in SSH agent',
      status: 'warning',
      message: 'Could not check agent status',
    }
  }
}

// ============================================================
// Fix Actions
// ============================================================

/**
 * Execute a diagnostic fix action
 */
export async function executeFixAction(
  action: DiagnosticFixAction
): Promise<{ success: boolean; message: string }> {
  switch (action.type) {
    case 'chmod':
      if (!action.params?.keyPath) {
        return { success: false, message: 'No key path specified' }
      }
      return await fixKeyPermissions(action.params.keyPath)

    case 'ssh-add':
      if (!action.params?.keyPath) {
        return { success: false, message: 'No key path specified' }
      }
      const addResult = await addKeyToAgent(action.params.keyPath)
      return {
        success: addResult.success,
        message: addResult.message,
      }

    // Other fix types would be handled here
    default:
      return {
        success: false,
        message: `Fix action "${action.type}" not implemented`,
      }
  }
}

// ============================================================
// Root Cause Analysis
// ============================================================

/**
 * Analyze the root cause of a connection failure
 */
export function analyzeRootCause(
  result: SSHConnectionTestResult,
  preflightResult?: PreflightResult
): RootCauseAnalysis {
  const errorType = result.errorType
  const errorDetails = result.errorDetails

  // Check preflight failures first
  const preflightFailures =
    preflightResult?.checks.filter((c) => c.status === 'failed') || []

  if (preflightFailures.length > 0) {
    const firstFailure = preflightFailures[0]

    if (firstFailure.id === 'identity_file_exists') {
      return {
        likelyCause: 'The configured identity file does not exist',
        confidence: 'high',
        explanation:
          'SSH cannot find the private key file specified in your configuration. The file may have been moved, deleted, or the path is incorrect.',
        relatedIssues: ['Check your SSH config IdentityFile path'],
      }
    }

    if (firstFailure.id === 'identity_file_permissions') {
      return {
        likelyCause: 'Key file permissions are too permissive',
        confidence: 'high',
        explanation:
          'SSH requires private keys to have restricted permissions (600). Your key file is accessible by other users, which is a security risk.',
        relatedIssues: ['Run chmod 600 on your private key'],
      }
    }
  }

  // Analyze based on error type
  switch (errorType) {
    case 'permission_denied_key_permissions':
      return {
        likelyCause: 'Key file permissions are incorrect',
        confidence: 'high',
        explanation:
          'SSH detected that your private key file has permissions that are too open. This is a security feature to protect your keys.',
        relatedIssues: [
          'Private key should have 600 permissions',
          'SSH directory should have 700 permissions',
        ],
      }

    case 'permission_denied_key_not_in_agent':
      return {
        likelyCause: 'Key is not loaded in SSH agent',
        confidence: 'high',
        explanation:
          'Your key requires a passphrase but is not loaded in the SSH agent. The connection test cannot prompt for passwords.',
        relatedIssues: [
          'Run ssh-add to load the key',
          'Consider using keychain integration',
        ],
      }

    case 'permission_denied_passphrase':
      return {
        likelyCause: 'Key requires passphrase input',
        confidence: 'high',
        explanation:
          'Your key is encrypted with a passphrase, but the connection test runs in batch mode and cannot prompt for input.',
        relatedIssues: [
          'Add key to SSH agent with: ssh-add ~/.ssh/your_key',
          'The passphrase will be stored in the agent',
        ],
      }

    case 'permission_denied_wrong_key':
      return {
        likelyCause: 'Wrong key is being used',
        confidence: 'medium',
        explanation:
          'SSH tried multiple keys but none were accepted. This usually means the correct key is not configured for this host.',
        relatedIssues: [
          'Verify IdentityFile in SSH config',
          'Check that public key is added to the server',
          'Consider using IdentitiesOnly yes',
        ],
      }

    case 'permission_denied_auth_method':
      return {
        likelyCause: 'Server does not accept your authentication method',
        confidence: 'medium',
        explanation:
          'The server may not allow public key authentication, or your key algorithm is not supported.',
        relatedIssues: [
          'Check server SSH configuration',
          'Try using a different key type (Ed25519 recommended)',
        ],
      }

    case 'permission_denied':
      return {
        likelyCause: 'Authentication was rejected by the server',
        confidence: 'medium',
        explanation:
          'The server did not accept your SSH key. This could be due to the key not being added to the server, or a configuration issue.',
        relatedIssues: [
          'Verify public key is added to authorized_keys on server',
          'Check IdentityFile configuration',
          'Ensure key file permissions are correct',
        ],
      }

    case 'host_key_changed':
      return {
        likelyCause: 'Server identity has changed',
        confidence: 'high',
        explanation:
          "The server's SSH host key is different from what was previously recorded. This could be normal (server reinstall) or a security issue.",
        relatedIssues: [
          'If server was reinstalled, remove old key from known_hosts',
          'If unexpected, verify server identity before proceeding',
        ],
      }

    case 'host_key_unknown':
      return {
        likelyCause: 'First time connecting to this server',
        confidence: 'high',
        explanation:
          'This is a new server that you have not connected to before. SSH needs to verify and save its identity.',
        relatedIssues: [
          'This is normal for first-time connections',
          'The host key will be saved for future verification',
        ],
      }

    case 'connection_refused':
      return {
        likelyCause: 'SSH server is not accepting connections',
        confidence: 'medium',
        explanation:
          'The connection was actively refused. The SSH service may not be running, or a firewall is blocking the connection.',
        relatedIssues: [
          'Check if SSH server is running on the target',
          'Verify firewall rules allow SSH traffic',
          'Confirm the port number is correct',
        ],
      }

    case 'timeout':
      return {
        likelyCause: 'Network connectivity issue',
        confidence: 'medium',
        explanation:
          'The connection timed out before completing. This usually indicates a network problem or the server being unreachable.',
        relatedIssues: [
          'Check your network connection',
          'Verify the hostname/IP is correct',
          'Check if a firewall is blocking traffic',
        ],
      }

    case 'dns_failed':
      return {
        likelyCause: 'Hostname cannot be resolved',
        confidence: 'high',
        explanation:
          'DNS lookup failed for the specified hostname. The hostname may be misspelled or DNS is not working.',
        relatedIssues: [
          'Check hostname spelling',
          'Verify DNS settings',
          'Try using IP address directly',
        ],
      }

    default:
      return {
        likelyCause: 'Connection failed for unknown reason',
        confidence: 'low',
        explanation:
          errorDetails?.suggestion ||
          'An unexpected error occurred during the connection attempt.',
        relatedIssues: ['Check the debug log for more details'],
      }
  }
}

// ============================================================
// Troubleshooting Steps Generator
// ============================================================

/**
 * Generate troubleshooting steps based on error type and preflight results
 */
export function generateTroubleshootingSteps(
  errorType: SSHErrorType | undefined,
  errorDetails: SSHErrorDetails | undefined,
  preflightResult: PreflightResult | null
): TroubleshootingStep[] {
  const steps: TroubleshootingStep[] = []

  // Add steps for preflight failures first
  const preflightFailures =
    preflightResult?.checks.filter(
      (c) => c.status === 'failed' || c.status === 'warning'
    ) || []

  for (const check of preflightFailures) {
    if (check.fixAction) {
      steps.push({
        id: `preflight-${check.id}`,
        title: `Fix: ${check.name}`,
        description: check.message || check.description,
        status: 'pending',
        actions: [
          {
            id: check.fixAction.id,
            label: check.fixAction.label,
            type: 'auto',
            fixAction: check.fixAction,
            completed: false,
          },
          {
            id: `skip-${check.id}`,
            label: 'Skip',
            type: 'manual',
            completed: false,
          },
        ],
      })
    }
  }

  // Add error-specific steps
  if (errorDetails?.canAutoFix && errorDetails.fixType) {
    steps.push({
      id: `error-${errorType}`,
      title: getStepTitleForError(errorType),
      description: errorDetails.suggestion,
      status: 'pending',
      actions: [
        {
          id: `fix-${errorType}`,
          label: 'Auto Fix',
          type: 'auto',
          fixAction: {
            id: `fix-${errorType}`,
            label: 'Fix',
            description: errorDetails.suggestion,
            type: errorDetails.fixType,
            params: errorDetails.fixParams,
          },
          completed: false,
        },
      ],
    })
  }

  // Add a final re-test step
  steps.push({
    id: 'retest',
    title: 'Re-test Connection',
    description:
      'After applying fixes, test the connection again to verify it works.',
    status: 'pending',
    actions: [
      {
        id: 'retest-connection',
        label: 'Test Connection',
        type: 'auto',
        completed: false,
      },
    ],
  })

  return steps
}

function getStepTitleForError(errorType: SSHErrorType | undefined): string {
  switch (errorType) {
    case 'host_key_changed':
      return 'Remove Old Host Key'
    case 'host_key_unknown':
      return 'Add Host to Known Hosts'
    case 'permission_denied_key_permissions':
      return 'Fix Key Permissions'
    case 'permission_denied_key_not_in_agent':
    case 'permission_denied_passphrase':
      return 'Add Key to SSH Agent'
    default:
      return 'Apply Fix'
  }
}

// ============================================================
// Diagnostic Session
// ============================================================

/**
 * Create a new diagnostic session
 */
export function createDiagnosticSession(
  host: SSHHostConfig
): DiagnosticSession {
  return {
    hostAlias: host.Host,
    hostConfig: host,
    preflight: null,
    connectionResult: null,
    troubleshootingSteps: [],
    currentStep: 0,
    status: 'idle',
  }
}

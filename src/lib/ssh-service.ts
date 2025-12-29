/**
 * SSH Service
 * Handles SSH config and keys file operations using Tauri fs plugin
 */

import {
  readTextFile,
  writeTextFile,
  exists,
  copyFile,
} from '@tauri-apps/plugin-fs'
import { homeDir } from '@tauri-apps/api/path'
import { Command } from '@tauri-apps/plugin-shell'
import { invoke } from '@tauri-apps/api/core'
import {
  parseSSHConfig,
  serializeSSHConfig,
  addHost,
  updateHost,
  removeHost,
  createEmptyConfig,
  type ParsedSSHConfig,
  type SSHHostConfig,
} from './ssh-config'

// SSH Key info
export interface SSHKeyInfo {
  name: string
  type: 'ed25519' | 'rsa' | 'ecdsa' | 'dsa' | 'unknown'
  hasPublicKey: boolean
  publicKeyPath: string
  privateKeyPath: string
  fingerprint?: string
  comment?: string
  bitSize?: number // Key bit size (e.g., 4096 for RSA)
}

let sshDirPath: string | null = null

/**
 * Get the SSH directory path
 */
export async function getSSHDir(): Promise<string> {
  if (sshDirPath) return sshDirPath

  const home = await homeDir()
  // homeDir() returns path without trailing slash on some platforms
  sshDirPath = home.endsWith('/') ? `${home}.ssh` : `${home}/.ssh`
  console.log('[ssh-service] SSH dir path:', sshDirPath)
  return sshDirPath
}

/**
 * Get the SSH config file path
 */
export async function getSSHConfigPath(): Promise<string> {
  const sshDir = await getSSHDir()
  return `${sshDir}/config`
}

/**
 * Check if SSH directory exists
 */
export async function sshDirExists(): Promise<boolean> {
  const sshDir = await getSSHDir()
  return exists(sshDir)
}

/**
 * Check if SSH config exists
 */
export async function sshConfigExists(): Promise<boolean> {
  const configPath = await getSSHConfigPath()
  return exists(configPath)
}

/**
 * Read and parse SSH config
 */
export async function readSSHConfig(): Promise<ParsedSSHConfig> {
  const configPath = await getSSHConfigPath()
  console.log('[ssh-service] Config path:', configPath)

  const configExists = await exists(configPath)
  console.log('[ssh-service] Config exists:', configExists)
  if (!configExists) {
    return createEmptyConfig()
  }

  const content = await readTextFile(configPath)
  console.log('[ssh-service] Config content length:', content.length)
  return parseSSHConfig(content)
}

/**
 * Write SSH config (with backup)
 */
export async function writeSSHConfig(config: ParsedSSHConfig): Promise<void> {
  const configPath = await getSSHConfigPath()

  // Create backup if file exists
  const configExists = await exists(configPath)
  if (configExists) {
    const backupPath = `${configPath}.bak`
    await copyFile(configPath, backupPath)
  }

  const content = serializeSSHConfig(config)
  await writeTextFile(configPath, content)
}

/**
 * Add a new host to SSH config
 */
export async function addSSHHost(host: SSHHostConfig): Promise<void> {
  const config = await readSSHConfig()
  const newConfig = addHost(config, host)
  await writeSSHConfig(newConfig)
}

/**
 * Update an existing host in SSH config
 */
export async function updateSSHHost(
  oldHostName: string,
  newHost: SSHHostConfig
): Promise<void> {
  const config = await readSSHConfig()
  const newConfig = updateHost(config, oldHostName, newHost)
  await writeSSHConfig(newConfig)
}

/**
 * Remove a host from SSH config
 */
export async function removeSSHHost(hostName: string): Promise<void> {
  const config = await readSSHConfig()
  const newConfig = removeHost(config, hostName)
  await writeSSHConfig(newConfig)
}

/**
 * List all SSH keys in the .ssh directory
 * Uses Rust backend for secure key listing
 */
export async function listSSHKeys(): Promise<SSHKeyInfo[]> {
  try {
    console.log('[ssh-service] Listing SSH keys via Rust backend')
    const keys = await invoke<SSHKeyInfo[]>('list_ssh_keys')
    console.log('[ssh-service] Found', keys.length, 'keys')
    return keys
  } catch (error) {
    console.error('[ssh-service] Failed to list keys:', error)
    // Fallback to empty array on error
    return []
  }
}

/**
 * Read public key content
 * Uses Rust backend with path traversal protection
 */
export async function readPublicKey(keyName: string): Promise<string> {
  try {
    return await invoke<string>('read_public_key', { keyName })
  } catch (error) {
    console.error('[ssh-service] Failed to read public key:', error)
    throw error
  }
}

/**
 * Delete an SSH key pair
 * Uses Rust backend with path traversal protection
 */
export async function deleteSSHKey(keyName: string): Promise<void> {
  try {
    await invoke('delete_ssh_key', { keyName })
    console.log('[ssh-service] Key deleted:', keyName)
  } catch (error) {
    console.error('[ssh-service] Failed to delete key:', error)
    throw error
  }
}

/**
 * Generate options for SSH key generation
 */
export interface GenerateSSHKeyOptions {
  name: string
  type: 'ed25519' | 'rsa'
  comment?: string
  passphrase?: string
}

/**
 * Generate a new SSH key pair using Rust backend
 * Supports Ed25519 and RSA (4096-bit) keys
 */
export async function generateSSHKey(
  options: GenerateSSHKeyOptions
): Promise<SSHKeyInfo> {
  try {
    console.log('[ssh-service] Generating key via Rust backend:', options.name)
    const keyInfo = await invoke<SSHKeyInfo>('generate_ssh_key', {
      options: {
        name: options.name,
        keyType: options.type,
        comment: options.comment,
        passphrase: options.passphrase,
      },
    })
    console.log('[ssh-service] Key generated successfully:', keyInfo.name)
    return keyInfo
  } catch (error) {
    console.error('[ssh-service] Failed to generate key:', error)
    throw error
  }
}

/**
 * Get key type display name
 */
export function getKeyTypeDisplayName(type: SSHKeyInfo['type']): string {
  switch (type) {
    case 'ed25519':
      return 'Ed25519'
    case 'rsa':
      return 'RSA'
    case 'ecdsa':
      return 'ECDSA'
    case 'dsa':
      return 'DSA (deprecated)'
    default:
      return 'Unknown'
  }
}

/**
 * SSH error types for friendly error messages
 * Extended with sub-types for more precise diagnostics
 */
export type SSHErrorType =
  // Host key issues
  | 'host_key_changed'
  | 'host_key_unknown'
  // Authentication issues (with sub-types)
  | 'permission_denied'
  | 'permission_denied_key_permissions' // chmod 600 issue
  | 'permission_denied_key_not_in_agent' // key not added to agent
  | 'permission_denied_wrong_key' // wrong key being used
  | 'permission_denied_passphrase' // passphrase blocked by BatchMode
  | 'permission_denied_auth_method' // server doesn't accept publickey
  // Network issues
  | 'connection_refused'
  | 'timeout'
  | 'dns_failed'
  // Configuration issues
  | 'identity_file_not_found' // specified key doesn't exist
  | 'public_key_missing' // .pub file missing
  | 'unknown'

/**
 * Extended error details for diagnostic engine
 */
export interface SSHErrorDetails {
  type: SSHErrorType
  rawMessage: string
  suggestion: string
  canAutoFix: boolean
  fixType?: 'chmod' | 'ssh-add' | 'copy-pubkey' | 'remove-known-host' | 'add-known-host'
  fixParams?: Record<string, string>
}

/**
 * SSH Connection test result
 */
export interface SSHConnectionTestResult {
  success: boolean
  output: string
  platform?: 'github' | 'bitbucket' | 'gitlab' | 'unknown'
  errorType?: SSHErrorType
  errorDetails?: SSHErrorDetails // Extended error information for diagnostics
  hostToRemove?: string
  hostToAdd?: string // For host_key_unknown - the hostname to add to known_hosts
  identityFile?: string // The key file actually used for authentication
  debugLog?: string // Full verbose output for debugging
}

/**
 * Detect Git platform from hostname
 */
function detectPlatform(
  hostname: string
): 'github' | 'bitbucket' | 'gitlab' | 'unknown' {
  const lower = hostname.toLowerCase()
  if (lower.includes('github.com')) return 'github'
  if (lower.includes('bitbucket.org')) return 'bitbucket'
  if (lower.includes('gitlab.com') || lower.includes('gitlab')) return 'gitlab'
  return 'unknown'
}

/**
 * Detect SSH error type from output (basic detection)
 */
function detectErrorType(output: string): SSHErrorType | undefined {
  if (output.includes('REMOTE HOST IDENTIFICATION HAS CHANGED'))
    return 'host_key_changed'
  if (output.includes('Host key verification failed')) return 'host_key_unknown'
  if (output.includes('Permission denied')) return 'permission_denied'
  if (output.includes('Connection refused')) return 'connection_refused'
  if (
    output.toLowerCase().includes('timed out') ||
    output.includes('Connection timeout')
  )
    return 'timeout'
  if (output.includes('Could not resolve hostname')) return 'dns_failed'
  return undefined
}

/**
 * Enhanced error detection with sub-type classification
 * Analyzes SSH debug output to determine specific error causes
 */
function detectEnhancedErrorType(
  output: string,
  debugLog: string
): SSHErrorDetails | undefined {
  const fullOutput = `${output}\n${debugLog}`

  // Host key issues
  if (fullOutput.includes('REMOTE HOST IDENTIFICATION HAS CHANGED')) {
    return {
      type: 'host_key_changed',
      rawMessage: output,
      suggestion:
        'The host key has changed. This could indicate a server reinstall or a security issue.',
      canAutoFix: true,
      fixType: 'remove-known-host',
    }
  }

  if (fullOutput.includes('Host key verification failed')) {
    return {
      type: 'host_key_unknown',
      rawMessage: output,
      suggestion:
        'This is a new host. You can add it to known_hosts to trust it.',
      canAutoFix: true,
      fixType: 'add-known-host',
    }
  }

  // Permission issues - check for specific sub-types
  if (fullOutput.includes('Permission denied')) {
    // Check for key permission issues (chmod)
    if (
      fullOutput.includes('Permissions') &&
      fullOutput.includes('too open')
    ) {
      const keyPathMatch = fullOutput.match(
        /Permissions \d+ for '([^']+)' are too open/
      )
      return {
        type: 'permission_denied_key_permissions',
        rawMessage: output,
        suggestion:
          'Your private key file permissions are too open. Private keys should have 600 permissions.',
        canAutoFix: true,
        fixType: 'chmod',
        fixParams: keyPathMatch ? { keyPath: keyPathMatch[1] } : undefined,
      }
    }

    // Check for passphrase issues (BatchMode blocks prompts)
    if (
      fullOutput.includes('Enter passphrase for key') ||
      fullOutput.includes('passphrase')
    ) {
      return {
        type: 'permission_denied_passphrase',
        rawMessage: output,
        suggestion:
          'Your key requires a passphrase. Add it to the SSH agent first.',
        canAutoFix: true,
        fixType: 'ssh-add',
      }
    }

    // Check for no identities in agent
    if (
      fullOutput.includes('The agent has no identities') ||
      fullOutput.includes('Agent has no identities')
    ) {
      return {
        type: 'permission_denied_key_not_in_agent',
        rawMessage: output,
        suggestion:
          'No keys are loaded in your SSH agent. Add your key using ssh-add.',
        canAutoFix: true,
        fixType: 'ssh-add',
      }
    }

    // Check for auth method not supported
    if (
      fullOutput.includes('No more authentication methods to try') ||
      fullOutput.includes('no mutual signature algorithm')
    ) {
      return {
        type: 'permission_denied_auth_method',
        rawMessage: output,
        suggestion:
          'The server does not accept your authentication method. Check if publickey auth is enabled.',
        canAutoFix: false,
      }
    }

    // Check if wrong key is being used (multiple keys offered but none accepted)
    const offeredKeys = fullOutput.match(/Offering public key:/g)
    if (offeredKeys && offeredKeys.length > 1) {
      return {
        type: 'permission_denied_wrong_key',
        rawMessage: output,
        suggestion:
          'Multiple keys were tried but none were accepted. Make sure the correct key is configured.',
        canAutoFix: false,
      }
    }

    // Generic permission denied
    return {
      type: 'permission_denied',
      rawMessage: output,
      suggestion:
        'Authentication failed. Check that your public key is added to the server.',
      canAutoFix: false,
    }
  }

  // Check for identity file not found
  if (
    fullOutput.includes('No such file or directory') &&
    fullOutput.includes('identity')
  ) {
    const keyPathMatch = fullOutput.match(/identity file ([^\s]+).*No such file/)
    return {
      type: 'identity_file_not_found',
      rawMessage: output,
      suggestion:
        'The configured identity file does not exist. Check your SSH config.',
      canAutoFix: false,
      fixParams: keyPathMatch ? { keyPath: keyPathMatch[1] } : undefined,
    }
  }

  // Network issues
  if (fullOutput.includes('Connection refused')) {
    return {
      type: 'connection_refused',
      rawMessage: output,
      suggestion:
        'Connection refused. The SSH server may not be running or a firewall is blocking the connection.',
      canAutoFix: false,
    }
  }

  if (
    fullOutput.toLowerCase().includes('timed out') ||
    fullOutput.includes('Connection timeout')
  ) {
    return {
      type: 'timeout',
      rawMessage: output,
      suggestion:
        'Connection timed out. Check your network connection and firewall settings.',
      canAutoFix: false,
    }
  }

  if (fullOutput.includes('Could not resolve hostname')) {
    return {
      type: 'dns_failed',
      rawMessage: output,
      suggestion:
        'Hostname could not be resolved. Check the hostname spelling and your DNS settings.',
      canAutoFix: false,
    }
  }

  return undefined
}

/**
 * Extract hostname from host key changed error message
 * Looks for pattern: "Host key for <hostname> has changed"
 */
function extractHostFromError(output: string): string | undefined {
  // Pattern: "Host key for bitbucket.org has changed"
  const match = output.match(/Host key for ([^\s]+) has changed/)
  if (match) return match[1]

  // Pattern: "Offending RSA key in /path/to/known_hosts:1"
  // We need to find the hostname from context
  const offendingMatch = output.match(
    /Add correct host key in [^\s]+ to get rid of this message/
  )
  if (offendingMatch) {
    // Try to find hostname from earlier in the message
    const hostMatch = output.match(/connect to host ([^\s]+) port/)
    if (hostMatch) return hostMatch[1]
  }

  return undefined
}

/**
 * Extract the actual hostname from SSH debug output
 * Looks for pattern: "Connecting to hostname [ip] port 22"
 */
function extractConnectingHost(debugOutput: string): string | undefined {
  // Pattern: "Connecting to bitbucket.org [ip] port 22"
  const match = debugOutput.match(/Connecting to ([^\s[]+)/)
  if (match) return match[1]

  // Fallback: "connect to host xxx port"
  const fallback = debugOutput.match(/connect to host ([^\s]+) port/)
  if (fallback) return fallback[1]

  return undefined
}

/**
 * Extract the identity file used from SSH debug output
 * Looks for patterns like: "debug1: identity file /path/to/key type 3"
 * or "debug1: Offering public key: /path/to/key"
 */
function extractIdentityFile(debugOutput: string): string | undefined {
  // Pattern: "Offering public key: /path/to/key ED25519"
  // This indicates which key was actually offered to the server
  const offeringMatch = debugOutput.match(/Offering public key: ([^\s]+)/)
  if (offeringMatch) {
    return offeringMatch[1]
  }

  // Fallback: Look for identity file being read
  // Pattern: "identity file /path/to/key type 3"
  const identityMatches = debugOutput.matchAll(
    /identity file ([^\s]+) type \d+/g
  )
  const matches = Array.from(identityMatches)
  if (matches.length > 0) {
    // Return the last one that's not -1 (type -1 means file doesn't exist)
    for (let i = matches.length - 1; i >= 0; i--) {
      const typeMatch = debugOutput.match(
        new RegExp(
          `identity file ${matches[i][1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} type (\\d+)`
        )
      )
      if (typeMatch && typeMatch[1] !== '-1') {
        return matches[i][1]
      }
    }
  }

  return undefined
}

/**
 * Check if output indicates successful authentication
 */
function isAuthSuccess(output: string): boolean {
  const lower = output.toLowerCase()

  // GitHub: "Hi {user}! You've successfully authenticated"
  if (output.includes("You've successfully authenticated")) return true

  // GitLab: "Welcome to GitLab, @{user}!"
  if (output.includes('Welcome to GitLab')) return true

  // Bitbucket: "logged in as {user}"
  if (lower.includes('logged in as')) return true

  // Generic success patterns
  if (lower.includes('authenticated') && !lower.includes('not authenticated'))
    return true
  if (lower.includes('welcome')) return true

  return false
}

/**
 * Test SSH connection to a host
 * Uses `ssh -T <host>` to test authentication
 */
export async function testSSHConnection(
  hostAlias: string,
  hostname?: string
): Promise<SSHConnectionTestResult> {
  console.log('[ssh-service] Testing SSH connection to:', hostAlias)

  // Detect platform from hostname if provided
  const platform = hostname ? detectPlatform(hostname) : 'unknown'

  try {
    // Execute ssh -vT <host> with timeout
    // -v enables verbose mode to see which key is used
    // -T disables pseudo-terminal allocation (good for testing)
    // -o BatchMode=yes prevents password prompts
    // -o ConnectTimeout=10 sets 10 second timeout
    const command = Command.create('ssh', [
      '-vT',
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      hostAlias,
    ])

    const output = await command.execute()

    // Combine stdout and stderr (Git platforms output to stderr, debug goes to stderr too)
    const fullOutput = [output.stdout, output.stderr].filter(Boolean).join('\n')

    console.log('[ssh-service] SSH test output:', {
      code: output.code,
      stdout: output.stdout?.slice(0, 200),
      stderr: output.stderr?.slice(0, 200),
    })

    // GitHub returns exit code 1 even on success (because it doesn't provide shell)
    // So we need to check the output content for success indicators
    const success = isAuthSuccess(fullOutput)

    // Extract the user-facing message (non-debug lines)
    const userMessage = fullOutput
      .split('\n')
      .filter((line) => !line.startsWith('debug1:'))
      .join('\n')
      .trim()

    // Detect error type using both basic and enhanced detection
    const errorType = success ? undefined : detectErrorType(fullOutput)
    const errorDetails = success
      ? undefined
      : detectEnhancedErrorType(userMessage, fullOutput)

    const hostToRemove =
      errorType === 'host_key_changed'
        ? extractHostFromError(fullOutput)
        : undefined
    const hostToAdd =
      errorType === 'host_key_unknown'
        ? extractConnectingHost(fullOutput)
        : undefined

    // Extract which identity file was used from debug output
    const identityFile = extractIdentityFile(fullOutput)

    return {
      success,
      output: userMessage || 'No output received',
      platform,
      errorType: errorDetails?.type || errorType,
      errorDetails,
      hostToRemove,
      hostToAdd,
      identityFile,
      debugLog: fullOutput,
    }
  } catch (error) {
    console.error('[ssh-service] SSH test error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      output: errorMessage,
      platform,
      errorType: detectErrorType(errorMessage),
    }
  }
}

/**
 * Remove a host from known_hosts file
 * Uses ssh-keygen -R <hostname>
 */
export async function removeKnownHost(hostname: string): Promise<void> {
  console.log('[ssh-service] Removing known host:', hostname)

  const command = Command.create('ssh-keygen', ['-R', hostname])
  const output = await command.execute()

  if (output.code !== 0) {
    console.error('[ssh-service] ssh-keygen -R failed:', output.stderr)
    throw new Error(output.stderr || 'Failed to remove known host')
  }

  console.log('[ssh-service] Known host removed successfully')
}

/**
 * Add a host to known_hosts file
 * Uses ssh-keyscan to fetch the host key and appends to known_hosts
 */
export async function addKnownHost(hostname: string): Promise<void> {
  console.log('[ssh-service] Adding known host:', hostname)

  // First, get the host key using ssh-keyscan
  const keyscanCommand = Command.create('ssh-keyscan', ['-H', hostname])
  const keyscanOutput = await keyscanCommand.execute()

  if (keyscanOutput.code !== 0 || !keyscanOutput.stdout) {
    console.error('[ssh-service] ssh-keyscan failed:', keyscanOutput.stderr)
    throw new Error(keyscanOutput.stderr || 'Failed to fetch host key')
  }

  // Get the known_hosts path
  const sshDir = await getSSHDir()
  const knownHostsPath = `${sshDir}/known_hosts`

  // Check if known_hosts exists, if not create it
  const knownHostsExists = await exists(knownHostsPath)
  let currentContent = ''
  if (knownHostsExists) {
    currentContent = await readTextFile(knownHostsPath)
  }

  // Append the new host key
  const newContent = currentContent
    ? `${currentContent}\n${keyscanOutput.stdout}`
    : keyscanOutput.stdout

  await writeTextFile(knownHostsPath, newContent)

  console.log('[ssh-service] Known host added successfully')
}

// ============================================================
// SSH Agent Integration
// ============================================================

/**
 * Key info from SSH agent
 */
export interface AgentKeyInfo {
  bitSize: number
  fingerprint: string
  comment: string
  type: string
}

/**
 * List all keys currently loaded in the SSH agent
 */
export async function listAgentKeys(): Promise<AgentKeyInfo[]> {
  try {
    // ssh-add -l outputs:
    // <bits> <fingerprint> <comment> (<type>)
    // e.g., "256 SHA256:xxx user@host (ED25519)"
    const command = Command.create('ssh-add', ['-l'])
    const output = await command.execute()

    // Exit code 1 with "The agent has no identities" means empty agent
    if (output.code !== 0) {
      if (
        output.stderr?.includes('agent has no identities') ||
        output.stdout?.includes('agent has no identities')
      ) {
        return []
      }
      // Other errors (e.g., agent not running)
      console.warn('[ssh-service] ssh-add -l failed:', output.stderr)
      return []
    }

    const keys: AgentKeyInfo[] = []
    const lines = output.stdout.trim().split('\n')

    for (const line of lines) {
      if (!line.trim()) continue

      // Parse: "256 SHA256:xxx comment (ED25519)"
      const match = line.match(/^(\d+)\s+(\S+)\s+(.+?)\s+\(([^)]+)\)$/)
      if (match) {
        keys.push({
          bitSize: parseInt(match[1], 10),
          fingerprint: match[2],
          comment: match[3],
          type: match[4],
        })
      }
    }

    return keys
  } catch (error) {
    console.error('[ssh-service] Failed to list agent keys:', error)
    return []
  }
}

/**
 * Check if a specific key is loaded in the SSH agent
 * Compares fingerprints to determine if the key is loaded
 */
export async function isKeyInAgent(keyPath: string): Promise<boolean> {
  try {
    // Get the fingerprint of the key file
    const keyCommand = Command.create('ssh-keygen', ['-l', '-f', keyPath])
    const keyOutput = await keyCommand.execute()

    if (keyOutput.code !== 0 || !keyOutput.stdout) {
      return false
    }

    // Extract fingerprint from output
    const keyMatch = keyOutput.stdout.match(/\s+(\S+)\s+/)
    if (!keyMatch) return false
    const keyFingerprint = keyMatch[1]

    // Get all keys in agent
    const agentKeys = await listAgentKeys()

    // Check if any agent key matches
    return agentKeys.some((agentKey) => agentKey.fingerprint === keyFingerprint)
  } catch (error) {
    console.error('[ssh-service] Failed to check if key in agent:', error)
    return false
  }
}

/**
 * Result of adding a key to the agent
 */
export interface AddKeyResult {
  success: boolean
  message: string
  needsPassphrase: boolean
}

/**
 * Add a key to the SSH agent
 * Note: If the key has a passphrase, this will fail in BatchMode
 * The user should use ssh-add manually or through terminal
 */
export async function addKeyToAgent(keyPath: string): Promise<AddKeyResult> {
  try {
    // First check if key is already in agent
    const alreadyLoaded = await isKeyInAgent(keyPath)
    if (alreadyLoaded) {
      return {
        success: true,
        message: 'Key is already loaded in the agent',
        needsPassphrase: false,
      }
    }

    // Try to add the key
    // Note: This will fail if the key has a passphrase since we can't prompt
    const command = Command.create('ssh-add', [keyPath])
    const output = await command.execute()

    if (output.code === 0) {
      return {
        success: true,
        message: 'Key added to SSH agent successfully',
        needsPassphrase: false,
      }
    }

    // Check if it failed due to passphrase
    const combinedOutput = `${output.stdout || ''} ${output.stderr || ''}`
    if (
      combinedOutput.includes('passphrase') ||
      combinedOutput.includes('Enter passphrase') ||
      combinedOutput.includes('Bad passphrase')
    ) {
      return {
        success: false,
        message:
          'This key requires a passphrase. Please run ssh-add manually in terminal.',
        needsPassphrase: true,
      }
    }

    return {
      success: false,
      message: output.stderr || 'Failed to add key to agent',
      needsPassphrase: false,
    }
  } catch (error) {
    console.error('[ssh-service] Failed to add key to agent:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      needsPassphrase: false,
    }
  }
}

/**
 * Remove a key from the SSH agent
 */
export async function removeKeyFromAgent(keyPath: string): Promise<{
  success: boolean
  message: string
}> {
  try {
    const command = Command.create('ssh-add', ['-d', keyPath])
    const output = await command.execute()

    if (output.code === 0) {
      return {
        success: true,
        message: 'Key removed from SSH agent',
      }
    }

    return {
      success: false,
      message: output.stderr || 'Failed to remove key from agent',
    }
  } catch (error) {
    console.error('[ssh-service] Failed to remove key from agent:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Check if SSH agent is running and accessible
 */
export async function isAgentRunning(): Promise<boolean> {
  try {
    const command = Command.create('ssh-add', ['-l'])
    const output = await command.execute()

    // Exit code 0 = has keys, exit code 1 = no keys but agent running
    // Exit code 2 = agent not running or not accessible
    if (output.code === 0 || output.code === 1) {
      return true
    }

    // Check stderr for "Could not open" or similar
    if (output.stderr?.includes('Could not open')) {
      return false
    }

    return output.code !== 2
  } catch (error) {
    console.error('[ssh-service] Failed to check agent status:', error)
    return false
  }
}

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
  fixType?:
    | 'chmod'
    | 'ssh-add'
    | 'copy-pubkey'
    | 'remove-known-host'
    | 'add-known-host'
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
 * Detect SSH error type from output (basic detection)
 * Used for fallback error handling when Rust backend fails
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
 * Test SSH connection to a host
 * Uses Rust backend for pure Rust SSH connection testing
 */
export async function testSSHConnection(
  hostAlias: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _hostname?: string
): Promise<SSHConnectionTestResult> {
  console.log(
    '[ssh-service] Testing SSH connection via Rust backend:',
    hostAlias
  )

  try {
    const result = await invoke<SSHConnectionTestResult>(
      'test_ssh_connection',
      {
        hostAlias,
      }
    )
    console.log('[ssh-service] SSH test result:', {
      success: result.success,
      output: result.output?.slice(0, 200),
    })
    return result
  } catch (error) {
    console.error('[ssh-service] SSH test error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      output: errorMessage,
      errorType: detectErrorType(errorMessage),
    }
  }
}

/**
 * Known host operation result
 */
interface KnownHostResult {
  success: boolean
  message: string
  removedCount?: number
  keysAdded?: number
}

/**
 * Remove a host from known_hosts file
 * Uses Rust backend
 */
export async function removeKnownHost(hostname: string): Promise<void> {
  console.log('[ssh-service] Removing known host via Rust backend:', hostname)

  const result = await invoke<KnownHostResult>('remove_known_host', {
    hostname,
  })
  console.log('[ssh-service] Remove known host result:', result)

  if (!result.success) {
    throw new Error(result.message)
  }
}

/**
 * Add a host to known_hosts file
 * Uses Rust backend with ssh-keyscan
 */
export async function addKnownHost(
  hostname: string,
  port?: number
): Promise<void> {
  console.log('[ssh-service] Adding known host via Rust backend:', hostname)

  const result = await invoke<KnownHostResult>('add_known_host', {
    hostname,
    port,
  })
  console.log('[ssh-service] Add known host result:', result)

  if (!result.success) {
    throw new Error(result.message)
  }
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
 * Uses Rust backend for direct SSH Agent protocol communication
 */
export async function listAgentKeys(): Promise<AgentKeyInfo[]> {
  try {
    console.log('[ssh-service] Listing agent keys via Rust backend')
    const keys = await invoke<AgentKeyInfo[]>('list_agent_keys')
    console.log('[ssh-service] Found', keys.length, 'keys in agent')
    return keys
  } catch (error) {
    console.error('[ssh-service] Failed to list agent keys:', error)
    return []
  }
}

/**
 * Check if a specific key is loaded in the SSH agent
 * Uses Rust backend for fingerprint comparison
 */
export async function isKeyInAgent(keyPath: string): Promise<boolean> {
  try {
    console.log('[ssh-service] Checking if key in agent:', keyPath)
    const inAgent = await invoke<boolean>('is_key_in_agent', { keyPath })
    console.log('[ssh-service] Key in agent:', inAgent)
    return inAgent
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
 * Uses Rust backend. If key has passphrase, returns needsPassphrase=true
 * @param keyPath - Path to the private key file
 * @param passphrase - Optional passphrase for encrypted keys
 */
export async function addKeyToAgent(
  keyPath: string,
  passphrase?: string
): Promise<AddKeyResult> {
  try {
    console.log('[ssh-service] Adding key to agent:', keyPath)
    const result = await invoke<AddKeyResult>('add_key_to_agent', {
      keyPath,
      passphrase: passphrase ?? null,
    })
    console.log('[ssh-service] Add key result:', result)
    return result
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
 * Uses Rust backend
 */
export async function removeKeyFromAgent(keyPath: string): Promise<{
  success: boolean
  message: string
}> {
  try {
    console.log('[ssh-service] Removing key from agent:', keyPath)
    const result = await invoke<{ success: boolean; message: string }>(
      'remove_key_from_agent',
      { keyPath }
    )
    console.log('[ssh-service] Remove key result:', result)
    return result
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
 * Uses Rust backend for direct Unix socket detection
 */
export async function isAgentRunning(): Promise<boolean> {
  try {
    console.log('[ssh-service] Checking if agent is running via Rust backend')
    const running = await invoke<boolean>('is_agent_running')
    console.log('[ssh-service] Agent running:', running)
    return running
  } catch (error) {
    console.error('[ssh-service] Failed to check agent status:', error)
    return false
  }
}

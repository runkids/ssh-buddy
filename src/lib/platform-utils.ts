/**
 * Platform Utilities
 * Cross-platform utilities for SSH key permission management
 */

import { platform } from '@tauri-apps/plugin-os'
import { Command } from '@tauri-apps/plugin-shell'
import { stat } from '@tauri-apps/plugin-fs'

export type Platform = 'macos' | 'windows' | 'linux'

/**
 * Get the current platform
 */
export function getPlatform(): Platform {
  const os = platform()
  // Tauri plugin-os returns 'macos' directly, not 'darwin'
  if (os === 'macos') return 'macos'
  if (os === 'windows') return 'windows'
  // All other Unix-like systems (linux, freebsd, etc.)
  return 'linux'
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  isSecure: boolean
  currentMode?: string
  requiredMode: string
  message: string
  canFix: boolean
}

/**
 * Check if a key file has secure permissions
 * - macOS/Linux: Should be 600 (owner read/write only)
 * - Windows: Uses different ACL system
 */
export async function checkKeyPermissions(
  keyPath: string
): Promise<PermissionCheckResult> {
  const currentPlatform = getPlatform()

  if (currentPlatform === 'windows') {
    return checkWindowsPermissions(keyPath)
  } else {
    return checkUnixPermissions(keyPath)
  }
}

/**
 * Check Unix (macOS/Linux) file permissions
 */
async function checkUnixPermissions(
  keyPath: string
): Promise<PermissionCheckResult> {
  try {
    // Use Tauri's stat to get file info
    const fileInfo = await stat(keyPath)

    // fileInfo.mode contains the Unix permissions
    // We need to check if it's 0o600 (owner read/write only)
    if (fileInfo.mode === undefined || fileInfo.mode === null) {
      // If mode is not available, try using stat command
      return await checkUnixPermissionsViaCommand(keyPath)
    }

    // Extract permission bits (last 9 bits)
    const mode = fileInfo.mode
    const permBits = mode & 0o777
    const permString = permBits.toString(8).padStart(3, '0')

    // For private keys, permissions should be 600 (owner read/write only)
    // 644 or higher is insecure
    const isSecure = permBits === 0o600 || permBits === 0o400

    return {
      isSecure,
      currentMode: permString,
      requiredMode: '600',
      message: isSecure
        ? 'Key permissions are secure'
        : `Key permissions are ${permString}, should be 600`,
      canFix: !isSecure,
    }
  } catch (error) {
    console.warn('[platform-utils] Failed to check permissions via stat:', error)
    // Fallback to command-based check
    return await checkUnixPermissionsViaCommand(keyPath)
  }
}

/**
 * Check Unix permissions using stat command (fallback)
 */
async function checkUnixPermissionsViaCommand(
  keyPath: string
): Promise<PermissionCheckResult> {
  try {
    const currentPlatform = getPlatform()
    let args: string[]

    if (currentPlatform === 'macos') {
      // macOS stat format
      args = ['-f', '%Lp', keyPath]
    } else {
      // Linux stat format
      args = ['-c', '%a', keyPath]
    }

    const command = Command.create('stat', args)
    const output = await command.execute()

    if (output.code !== 0) {
      return {
        isSecure: false,
        requiredMode: '600',
        message: 'Could not check file permissions',
        canFix: false,
      }
    }

    const permString = output.stdout.trim()
    const permBits = parseInt(permString, 8)
    const isSecure = permBits === 0o600 || permBits === 0o400

    return {
      isSecure,
      currentMode: permString,
      requiredMode: '600',
      message: isSecure
        ? 'Key permissions are secure'
        : `Key permissions are ${permString}, should be 600`,
      canFix: !isSecure,
    }
  } catch (error) {
    console.error('[platform-utils] Failed to check Unix permissions:', error)
    return {
      isSecure: false,
      requiredMode: '600',
      message: 'Could not check file permissions',
      canFix: false,
    }
  }
}

/**
 * Check Windows file permissions
 * Windows uses ACLs instead of Unix permission bits
 */
async function checkWindowsPermissions(
  keyPath: string
): Promise<PermissionCheckResult> {
  try {
    // Use icacls to check permissions
    const command = Command.create('icacls', [keyPath])
    const output = await command.execute()

    if (output.code !== 0) {
      return {
        isSecure: false,
        requiredMode: 'Owner only',
        message: 'Could not check file permissions',
        canFix: false,
      }
    }

    const aclOutput = output.stdout

    // Check if file is accessible only by the owner
    // Look for patterns that indicate insecure permissions
    // Insecure if: BUILTIN\Users, Everyone, or other groups have access
    const hasInsecureAccess =
      aclOutput.includes('BUILTIN\\Users') ||
      aclOutput.includes('Everyone') ||
      aclOutput.includes('Authenticated Users')

    return {
      isSecure: !hasInsecureAccess,
      currentMode: hasInsecureAccess ? 'Too permissive' : 'Owner only',
      requiredMode: 'Owner only',
      message: hasInsecureAccess
        ? 'Key is accessible by other users'
        : 'Key permissions are secure',
      canFix: hasInsecureAccess,
    }
  } catch (error) {
    console.error('[platform-utils] Failed to check Windows permissions:', error)
    return {
      isSecure: false,
      requiredMode: 'Owner only',
      message: 'Could not check file permissions',
      canFix: false,
    }
  }
}

/**
 * Fix key file permissions
 */
export async function fixKeyPermissions(keyPath: string): Promise<{
  success: boolean
  message: string
}> {
  const currentPlatform = getPlatform()

  if (currentPlatform === 'windows') {
    return fixWindowsPermissions(keyPath)
  } else {
    return fixUnixPermissions(keyPath)
  }
}

/**
 * Fix Unix file permissions to 600
 */
async function fixUnixPermissions(keyPath: string): Promise<{
  success: boolean
  message: string
}> {
  try {
    const command = Command.create('chmod', ['600', keyPath])
    const output = await command.execute()

    if (output.code !== 0) {
      return {
        success: false,
        message: output.stderr || 'Failed to fix permissions',
      }
    }

    return {
      success: true,
      message: 'Permissions set to 600',
    }
  } catch (error) {
    console.error('[platform-utils] Failed to fix Unix permissions:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Fix Windows file permissions
 * Removes access for all users except the owner
 */
async function fixWindowsPermissions(keyPath: string): Promise<{
  success: boolean
  message: string
}> {
  try {
    // First, reset to disable inheritance and remove all inherited permissions
    const resetCommand = Command.create('icacls', [
      keyPath,
      '/inheritance:r',
    ])
    await resetCommand.execute()

    // Get current username
    const whoamiCommand = Command.create('whoami', [])
    const whoamiOutput = await whoamiCommand.execute()
    const username = whoamiOutput.stdout.trim()

    // Grant full control to current user only
    const grantCommand = Command.create('icacls', [
      keyPath,
      '/grant:r',
      `${username}:(F)`,
    ])
    const grantOutput = await grantCommand.execute()

    if (grantOutput.code !== 0) {
      return {
        success: false,
        message: grantOutput.stderr || 'Failed to fix permissions',
      }
    }

    return {
      success: true,
      message: 'Permissions set to owner only',
    }
  } catch (error) {
    console.error('[platform-utils] Failed to fix Windows permissions:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Check if SSH directory has correct permissions
 * - macOS/Linux: Should be 700
 */
export async function checkSSHDirPermissions(
  sshDirPath: string
): Promise<PermissionCheckResult> {
  const currentPlatform = getPlatform()

  if (currentPlatform === 'windows') {
    // Windows doesn't enforce directory permissions the same way
    return {
      isSecure: true,
      requiredMode: 'N/A',
      message: 'Windows handles directory permissions differently',
      canFix: false,
    }
  }

  try {
    const fileInfo = await stat(sshDirPath)

    if (fileInfo.mode === undefined || fileInfo.mode === null) {
      return {
        isSecure: false,
        requiredMode: '700',
        message: 'Could not check directory permissions',
        canFix: false,
      }
    }

    const mode = fileInfo.mode
    const permBits = mode & 0o777
    const permString = permBits.toString(8).padStart(3, '0')
    const isSecure = permBits === 0o700

    return {
      isSecure,
      currentMode: permString,
      requiredMode: '700',
      message: isSecure
        ? 'SSH directory permissions are secure'
        : `SSH directory permissions are ${permString}, should be 700`,
      canFix: !isSecure,
    }
  } catch (error) {
    console.error('[platform-utils] Failed to check SSH dir permissions:', error)
    return {
      isSecure: false,
      requiredMode: '700',
      message: 'Could not check directory permissions',
      canFix: false,
    }
  }
}

/**
 * Fix SSH directory permissions to 700
 */
export async function fixSSHDirPermissions(sshDirPath: string): Promise<{
  success: boolean
  message: string
}> {
  const currentPlatform = getPlatform()

  if (currentPlatform === 'windows') {
    return {
      success: true,
      message: 'Windows handles directory permissions differently',
    }
  }

  try {
    const command = Command.create('chmod', ['700', sshDirPath])
    const output = await command.execute()

    if (output.code !== 0) {
      return {
        success: false,
        message: output.stderr || 'Failed to fix directory permissions',
      }
    }

    return {
      success: true,
      message: 'Directory permissions set to 700',
    }
  } catch (error) {
    console.error('[platform-utils] Failed to fix SSH dir permissions:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

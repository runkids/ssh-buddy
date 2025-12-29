/**
 * Platform Utilities
 * Cross-platform utilities for SSH key permission management
 * Uses Rust backend for all permission operations
 */

import { platform } from '@tauri-apps/plugin-os'
import { invoke } from '@tauri-apps/api/core'

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
 * Permission check result from Rust backend
 */
interface RustPermissionCheckResult {
  isValid: boolean
  currentMode: string | null
  expectedMode: string
  message: string
}

/**
 * Permission fix result from Rust backend
 */
interface RustPermissionFixResult {
  success: boolean
  message: string
  newMode: string | null
}

/**
 * Permission check result (frontend format)
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
 * Uses Rust backend for cross-platform permission checking
 */
export async function checkKeyPermissions(
  keyPath: string
): Promise<PermissionCheckResult> {
  try {
    console.log('[platform-utils] Checking key permissions via Rust backend:', keyPath)
    const result = await invoke<RustPermissionCheckResult>('check_key_permissions', {
      keyPath,
    })

    return {
      isSecure: result.isValid,
      currentMode: result.currentMode ?? undefined,
      requiredMode: result.expectedMode,
      message: result.message,
      canFix: !result.isValid,
    }
  } catch (error) {
    console.error('[platform-utils] Failed to check key permissions:', error)
    return {
      isSecure: false,
      requiredMode: '600',
      message: 'Could not check file permissions',
      canFix: false,
    }
  }
}

/**
 * Fix key file permissions
 * Uses Rust backend for cross-platform permission fixing
 */
export async function fixKeyPermissions(keyPath: string): Promise<{
  success: boolean
  message: string
}> {
  try {
    console.log('[platform-utils] Fixing key permissions via Rust backend:', keyPath)
    const result = await invoke<RustPermissionFixResult>('fix_key_permissions', {
      keyPath,
    })

    return {
      success: result.success,
      message: result.message,
    }
  } catch (error) {
    console.error('[platform-utils] Failed to fix key permissions:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Check if SSH directory has correct permissions
 * Uses Rust backend
 */
export async function checkSSHDirPermissions(
  _sshDirPath?: string
): Promise<PermissionCheckResult> {
  try {
    console.log('[platform-utils] Checking SSH dir permissions via Rust backend')
    const result = await invoke<RustPermissionCheckResult>('check_ssh_dir_permissions')

    return {
      isSecure: result.isValid,
      currentMode: result.currentMode ?? undefined,
      requiredMode: result.expectedMode,
      message: result.message,
      canFix: !result.isValid,
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
 * Fix SSH directory permissions
 * Uses Rust backend
 */
export async function fixSSHDirPermissions(_sshDirPath?: string): Promise<{
  success: boolean
  message: string
}> {
  try {
    console.log('[platform-utils] Fixing SSH dir permissions via Rust backend')
    const result = await invoke<RustPermissionFixResult>('fix_ssh_dir_permissions')

    return {
      success: result.success,
      message: result.message,
    }
  } catch (error) {
    console.error('[platform-utils] Failed to fix SSH dir permissions:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

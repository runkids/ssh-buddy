import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  analyzeRootCause,
  generateTroubleshootingSteps,
  createDiagnosticSession,
  executeFixAction,
  type PreflightResult,
  type DiagnosticFixAction,
} from '../../lib/diagnostic-engine'
import type { SSHConnectionTestResult, SSHErrorType } from '../../lib/ssh-service'

// Mock dependencies
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('../../lib/ssh-service', () => ({
  isKeyInAgent: vi.fn(),
  isAgentRunning: vi.fn(),
  addKeyToAgent: vi.fn(),
  getSSHDir: vi.fn().mockResolvedValue('/Users/test/.ssh'),
}))

vi.mock('../../lib/platform-utils', () => ({
  checkKeyPermissions: vi.fn(),
  fixKeyPermissions: vi.fn(),
}))

describe('diagnostic-engine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ========================================
  // analyzeRootCause tests
  // ========================================

  describe('analyzeRootCause', () => {
    it('should analyze host_key_changed error', () => {
      const result: SSHConnectionTestResult = {
        success: false,
        output: 'REMOTE HOST IDENTIFICATION HAS CHANGED',
        errorType: 'host_key_changed',
      }

      const analysis = analyzeRootCause(result)

      expect(analysis.likelyCause).toContain('identity has changed')
      expect(analysis.confidence).toBe('high')
    })

    it('should analyze host_key_unknown error', () => {
      const result: SSHConnectionTestResult = {
        success: false,
        output: 'Host key verification failed',
        errorType: 'host_key_unknown',
      }

      const analysis = analyzeRootCause(result)

      expect(analysis.likelyCause).toContain('First time')
      expect(analysis.confidence).toBe('high')
    })

    it('should analyze permission_denied_key_permissions error', () => {
      const result: SSHConnectionTestResult = {
        success: false,
        output: 'Permissions too open',
        errorType: 'permission_denied_key_permissions',
      }

      const analysis = analyzeRootCause(result)

      expect(analysis.likelyCause).toContain('permissions')
      expect(analysis.confidence).toBe('high')
    })

    it('should analyze permission_denied_key_not_in_agent error', () => {
      const result: SSHConnectionTestResult = {
        success: false,
        output: 'Permission denied',
        errorType: 'permission_denied_key_not_in_agent',
      }

      const analysis = analyzeRootCause(result)

      expect(analysis.likelyCause).toContain('not loaded')
      expect(analysis.confidence).toBe('high')
    })

    it('should analyze permission_denied_passphrase error', () => {
      const result: SSHConnectionTestResult = {
        success: false,
        output: 'Permission denied',
        errorType: 'permission_denied_passphrase',
      }

      const analysis = analyzeRootCause(result)

      expect(analysis.likelyCause).toContain('passphrase')
      expect(analysis.confidence).toBe('high')
    })

    it('should analyze permission_denied_wrong_key error', () => {
      const result: SSHConnectionTestResult = {
        success: false,
        output: 'Permission denied',
        errorType: 'permission_denied_wrong_key',
      }

      const analysis = analyzeRootCause(result)

      expect(analysis.likelyCause).toContain('Wrong key')
      expect(analysis.confidence).toBe('medium')
    })

    it('should analyze connection_refused error', () => {
      const result: SSHConnectionTestResult = {
        success: false,
        output: 'Connection refused',
        errorType: 'connection_refused',
      }

      const analysis = analyzeRootCause(result)

      expect(analysis.likelyCause).toContain('not accepting connections')
      expect(analysis.confidence).toBe('medium')
    })

    it('should analyze timeout error', () => {
      const result: SSHConnectionTestResult = {
        success: false,
        output: 'Connection timed out',
        errorType: 'timeout',
      }

      const analysis = analyzeRootCause(result)

      expect(analysis.likelyCause).toContain('Network')
      expect(analysis.confidence).toBe('medium')
    })

    it('should analyze dns_failed error', () => {
      const result: SSHConnectionTestResult = {
        success: false,
        output: 'Could not resolve hostname',
        errorType: 'dns_failed',
      }

      const analysis = analyzeRootCause(result)

      expect(analysis.likelyCause).toContain('cannot be resolved')
      expect(analysis.confidence).toBe('high')
    })

    it('should analyze unknown error', () => {
      const result: SSHConnectionTestResult = {
        success: false,
        output: 'Some unknown error',
        errorType: 'unknown',
      }

      const analysis = analyzeRootCause(result)

      expect(analysis.likelyCause).toContain('unknown reason')
      expect(analysis.confidence).toBe('low')
    })

    it('should prioritize preflight failures', () => {
      const result: SSHConnectionTestResult = {
        success: false,
        output: 'Permission denied',
        errorType: 'permission_denied',
      }

      const preflightResult: PreflightResult = {
        checks: [
          {
            id: 'identity_file_exists',
            name: 'Identity File',
            description: 'Check if identity file exists',
            status: 'failed',
            message: 'File not found',
          },
        ],
        allPassed: false,
        hasWarnings: false,
        hasErrors: true,
        timestamp: Date.now(),
      }

      const analysis = analyzeRootCause(result, preflightResult)

      expect(analysis.likelyCause).toContain('identity file does not exist')
      expect(analysis.confidence).toBe('high')
    })

    it('should handle permission preflight failure', () => {
      const result: SSHConnectionTestResult = {
        success: false,
        output: 'Permission denied',
        errorType: 'permission_denied',
      }

      const preflightResult: PreflightResult = {
        checks: [
          {
            id: 'identity_file_permissions',
            name: 'Key Permissions',
            description: 'Check permissions',
            status: 'failed',
            message: 'Permissions too open',
          },
        ],
        allPassed: false,
        hasWarnings: false,
        hasErrors: true,
        timestamp: Date.now(),
      }

      const analysis = analyzeRootCause(result, preflightResult)

      expect(analysis.likelyCause).toContain('permissions are too permissive')
      expect(analysis.confidence).toBe('high')
    })
  })

  // ========================================
  // generateTroubleshootingSteps tests
  // ========================================

  describe('generateTroubleshootingSteps', () => {
    it('should generate steps for host_key_changed error', () => {
      const errorType: SSHErrorType = 'host_key_changed'
      const errorDetails = {
        type: errorType,
        rawMessage: 'Host key changed',
        suggestion: 'Remove old key from known_hosts',
        canAutoFix: true,
        fixType: 'remove-known-host' as const,
        fixParams: { hostname: 'github.com' },
      }

      const steps = generateTroubleshootingSteps(errorType, errorDetails, null)

      expect(steps.length).toBeGreaterThan(0)
      // Should have the error fix step and retest step
      expect(steps.some((s) => s.id.includes('host_key_changed'))).toBe(true)
      expect(steps.some((s) => s.id === 'retest')).toBe(true)
    })

    it('should generate steps from preflight failures', () => {
      const preflightResult: PreflightResult = {
        checks: [
          {
            id: 'key_in_agent',
            name: 'Key in Agent',
            description: 'Check if key is in agent',
            status: 'warning',
            message: 'Key not in agent',
            fixAction: {
              id: 'add-to-agent',
              label: 'Add to Agent',
              description: 'Load key into agent',
              type: 'ssh-add',
              params: { keyPath: '/Users/test/.ssh/id_ed25519' },
            },
          },
        ],
        allPassed: false,
        hasWarnings: true,
        hasErrors: false,
        timestamp: Date.now(),
      }

      const steps = generateTroubleshootingSteps(undefined, undefined, preflightResult)

      expect(steps.length).toBeGreaterThan(0)
      expect(steps.some((s) => s.id.includes('preflight-key_in_agent'))).toBe(true)
    })

    it('should always include retest step', () => {
      const steps = generateTroubleshootingSteps(undefined, undefined, null)

      expect(steps.some((s) => s.id === 'retest')).toBe(true)
    })
  })

  // ========================================
  // createDiagnosticSession tests
  // ========================================

  describe('createDiagnosticSession', () => {
    it('should create session with correct initial state', () => {
      const host = {
        Host: 'github',
        HostName: 'github.com',
        User: 'git',
        IdentityFile: '~/.ssh/id_ed25519',
      }

      const session = createDiagnosticSession(host)

      expect(session.hostAlias).toBe('github')
      expect(session.hostConfig).toEqual(host)
      expect(session.preflight).toBeNull()
      expect(session.connectionResult).toBeNull()
      expect(session.troubleshootingSteps).toEqual([])
      expect(session.currentStep).toBe(0)
      expect(session.status).toBe('idle')
    })
  })

  // ========================================
  // executeFixAction tests
  // ========================================

  describe('executeFixAction', () => {
    it('should return error for chmod without keyPath', async () => {
      const action: DiagnosticFixAction = {
        id: 'fix-perm',
        label: 'Fix Permissions',
        description: 'Set to 600',
        type: 'chmod',
        // No params
      }

      const result = await executeFixAction(action)

      expect(result.success).toBe(false)
      expect(result.message).toContain('No key path')
    })

    it('should return error for ssh-add without keyPath', async () => {
      const action: DiagnosticFixAction = {
        id: 'add-key',
        label: 'Add to Agent',
        description: 'Load key',
        type: 'ssh-add',
        // No params
      }

      const result = await executeFixAction(action)

      expect(result.success).toBe(false)
      expect(result.message).toContain('No key path')
    })

    it('should return error for unimplemented fix type', async () => {
      const action: DiagnosticFixAction = {
        id: 'unknown',
        label: 'Unknown Fix',
        description: 'Unknown',
        type: 'copy-pubkey',
      }

      const result = await executeFixAction(action)

      expect(result.success).toBe(false)
      expect(result.message).toContain('not implemented')
    })

    it('should call fixKeyPermissions for chmod action', async () => {
      const { fixKeyPermissions } = await import('../../lib/platform-utils')
      vi.mocked(fixKeyPermissions).mockResolvedValueOnce({
        success: true,
        message: 'Permissions fixed',
      })

      const action: DiagnosticFixAction = {
        id: 'fix-perm',
        label: 'Fix Permissions',
        description: 'Set to 600',
        type: 'chmod',
        params: { keyPath: '/Users/test/.ssh/id_ed25519' },
      }

      const result = await executeFixAction(action)

      expect(fixKeyPermissions).toHaveBeenCalledWith('/Users/test/.ssh/id_ed25519')
      expect(result.success).toBe(true)
    })

    it('should call addKeyToAgent for ssh-add action', async () => {
      const { addKeyToAgent } = await import('../../lib/ssh-service')
      vi.mocked(addKeyToAgent).mockResolvedValueOnce({
        success: true,
        message: 'Key added',
        needsPassphrase: false,
      })

      const action: DiagnosticFixAction = {
        id: 'add-key',
        label: 'Add to Agent',
        description: 'Load key',
        type: 'ssh-add',
        params: { keyPath: '/Users/test/.ssh/id_ed25519' },
      }

      const result = await executeFixAction(action)

      expect(addKeyToAgent).toHaveBeenCalledWith(
        '/Users/test/.ssh/id_ed25519',
        undefined
      )
      expect(result.success).toBe(true)
    })

    it('should pass passphrase for ssh-add action', async () => {
      const { addKeyToAgent } = await import('../../lib/ssh-service')
      vi.mocked(addKeyToAgent).mockResolvedValueOnce({
        success: true,
        message: 'Key added',
        needsPassphrase: false,
      })

      const action: DiagnosticFixAction = {
        id: 'add-key',
        label: 'Add to Agent',
        description: 'Load key',
        type: 'ssh-add',
        params: { keyPath: '/Users/test/.ssh/id_encrypted' },
      }

      await executeFixAction(action, 'secret123')

      expect(addKeyToAgent).toHaveBeenCalledWith(
        '/Users/test/.ssh/id_encrypted',
        'secret123'
      )
    })

    it('should return needsPassphrase when key requires passphrase', async () => {
      const { addKeyToAgent } = await import('../../lib/ssh-service')
      vi.mocked(addKeyToAgent).mockResolvedValueOnce({
        success: false,
        message: 'This key requires a passphrase.',
        needsPassphrase: true,
      })

      const action: DiagnosticFixAction = {
        id: 'add-key',
        label: 'Add to Agent',
        description: 'Load key',
        type: 'ssh-add',
        params: { keyPath: '/Users/test/.ssh/id_encrypted' },
      }

      const result = await executeFixAction(action)

      expect(result.success).toBe(false)
      expect(result.needsPassphrase).toBe(true)
      expect(result.keyPath).toBe('/Users/test/.ssh/id_encrypted')
    })
  })
})

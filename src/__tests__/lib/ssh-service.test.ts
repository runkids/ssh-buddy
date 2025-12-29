import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import {
  getKeyTypeDisplayName,
  type SSHKeyInfo,
} from '../../lib/ssh-service'

// Mock the Tauri invoke function
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => ({
  homeDir: vi.fn().mockResolvedValue('/Users/test'),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  exists: vi.fn(),
  copyFile: vi.fn(),
}))

describe('ssh-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ========================================
  // getKeyTypeDisplayName tests
  // ========================================

  describe('getKeyTypeDisplayName', () => {
    it('should return "Ed25519" for ed25519 type', () => {
      expect(getKeyTypeDisplayName('ed25519')).toBe('Ed25519')
    })

    it('should return "RSA" for rsa type', () => {
      expect(getKeyTypeDisplayName('rsa')).toBe('RSA')
    })

    it('should return "ECDSA" for ecdsa type', () => {
      expect(getKeyTypeDisplayName('ecdsa')).toBe('ECDSA')
    })

    it('should return "DSA (deprecated)" for dsa type', () => {
      expect(getKeyTypeDisplayName('dsa')).toBe('DSA (deprecated)')
    })

    it('should return "Unknown" for unknown type', () => {
      expect(getKeyTypeDisplayName('unknown')).toBe('Unknown')
    })
  })

  // ========================================
  // listSSHKeys tests
  // ========================================

  describe('listSSHKeys', () => {
    it('should return keys from Rust backend', async () => {
      const mockKeys: SSHKeyInfo[] = [
        {
          name: 'id_ed25519',
          type: 'ed25519',
          hasPublicKey: true,
          publicKeyPath: '/Users/test/.ssh/id_ed25519.pub',
          privateKeyPath: '/Users/test/.ssh/id_ed25519',
          fingerprint: 'SHA256:abc123',
        },
      ]

      vi.mocked(invoke).mockResolvedValueOnce(mockKeys)

      const { listSSHKeys } = await import('../../lib/ssh-service')
      const keys = await listSSHKeys()

      expect(invoke).toHaveBeenCalledWith('list_ssh_keys')
      expect(keys).toEqual(mockKeys)
    })

    it('should return empty array on error', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Backend error'))

      const { listSSHKeys } = await import('../../lib/ssh-service')
      const keys = await listSSHKeys()

      expect(keys).toEqual([])
    })
  })

  // ========================================
  // readPublicKey tests
  // ========================================

  describe('readPublicKey', () => {
    it('should return public key content', async () => {
      const mockContent =
        'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample test@example'
      vi.mocked(invoke).mockResolvedValueOnce(mockContent)

      const { readPublicKey } = await import('../../lib/ssh-service')
      const content = await readPublicKey('id_ed25519')

      expect(invoke).toHaveBeenCalledWith('read_public_key', {
        keyName: 'id_ed25519',
      })
      expect(content).toBe(mockContent)
    })

    it('should throw error when key not found', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Key not found'))

      const { readPublicKey } = await import('../../lib/ssh-service')

      await expect(readPublicKey('nonexistent')).rejects.toThrow('Key not found')
    })
  })

  // ========================================
  // deleteSSHKey tests
  // ========================================

  describe('deleteSSHKey', () => {
    it('should call Rust backend to delete key', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined)

      const { deleteSSHKey } = await import('../../lib/ssh-service')
      await deleteSSHKey('id_test')

      expect(invoke).toHaveBeenCalledWith('delete_ssh_key', { keyName: 'id_test' })
    })

    it('should throw error on deletion failure', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Permission denied'))

      const { deleteSSHKey } = await import('../../lib/ssh-service')

      await expect(deleteSSHKey('id_test')).rejects.toThrow('Permission denied')
    })
  })

  // ========================================
  // generateSSHKey tests
  // ========================================

  describe('generateSSHKey', () => {
    it('should generate Ed25519 key', async () => {
      const mockKeyInfo: SSHKeyInfo = {
        name: 'test_key',
        type: 'ed25519',
        hasPublicKey: true,
        publicKeyPath: '/Users/test/.ssh/test_key.pub',
        privateKeyPath: '/Users/test/.ssh/test_key',
        fingerprint: 'SHA256:newkey',
      }

      vi.mocked(invoke).mockResolvedValueOnce(mockKeyInfo)

      const { generateSSHKey } = await import('../../lib/ssh-service')
      const result = await generateSSHKey({
        name: 'test_key',
        type: 'ed25519',
        comment: 'test@example.com',
      })

      expect(invoke).toHaveBeenCalledWith('generate_ssh_key', {
        options: {
          name: 'test_key',
          keyType: 'ed25519',
          comment: 'test@example.com',
          passphrase: undefined,
        },
      })
      expect(result).toEqual(mockKeyInfo)
    })

    it('should throw error for invalid key type', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(
        new Error('Unsupported key type: invalid')
      )

      const { generateSSHKey } = await import('../../lib/ssh-service')

      await expect(
        generateSSHKey({
          name: 'test_key',
          type: 'ed25519', // Valid type, but mock returns error
        })
      ).rejects.toThrow('Unsupported key type')
    })
  })

  // ========================================
  // testSSHConnection tests
  // ========================================

  describe('testSSHConnection', () => {
    it('should return success result', async () => {
      const mockResult = {
        success: true,
        output: "Hi! You've successfully authenticated",
        platform: 'github',
      }

      vi.mocked(invoke).mockResolvedValueOnce(mockResult)

      const { testSSHConnection } = await import('../../lib/ssh-service')
      const result = await testSSHConnection('github')

      expect(invoke).toHaveBeenCalledWith('test_ssh_connection', {
        hostAlias: 'github',
      })
      expect(result.success).toBe(true)
      expect(result.platform).toBe('github')
    })

    it('should handle host_key_unknown error', async () => {
      const mockResult = {
        success: false,
        output: 'Host key verification failed',
        errorType: 'host_key_unknown',
        hostToAdd: 'github.com',
      }

      vi.mocked(invoke).mockResolvedValueOnce(mockResult)

      const { testSSHConnection } = await import('../../lib/ssh-service')
      const result = await testSSHConnection('github')

      expect(result.success).toBe(false)
      expect(result.errorType).toBe('host_key_unknown')
      expect(result.hostToAdd).toBe('github.com')
    })

    it('should handle connection timeout', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Connection timed out'))

      const { testSSHConnection } = await import('../../lib/ssh-service')
      const result = await testSSHConnection('unknown-host')

      expect(result.success).toBe(false)
      expect(result.output).toContain('timed out')
    })
  })

  // ========================================
  // Agent-related tests
  // ========================================

  describe('listAgentKeys', () => {
    it('should return agent keys', async () => {
      const mockKeys = [
        {
          bitSize: 256,
          fingerprint: 'SHA256:abc123',
          comment: 'test@example.com',
          type: 'ssh-ed25519',
        },
      ]

      vi.mocked(invoke).mockResolvedValueOnce(mockKeys)

      const { listAgentKeys } = await import('../../lib/ssh-service')
      const keys = await listAgentKeys()

      expect(invoke).toHaveBeenCalledWith('list_agent_keys')
      expect(keys).toEqual(mockKeys)
    })

    it('should return empty array on error', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Agent not running'))

      const { listAgentKeys } = await import('../../lib/ssh-service')
      const keys = await listAgentKeys()

      expect(keys).toEqual([])
    })
  })

  describe('isAgentRunning', () => {
    it('should return true when agent is running', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(true)

      const { isAgentRunning } = await import('../../lib/ssh-service')
      const running = await isAgentRunning()

      expect(invoke).toHaveBeenCalledWith('is_agent_running')
      expect(running).toBe(true)
    })

    it('should return false when agent is not running', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(false)

      const { isAgentRunning } = await import('../../lib/ssh-service')
      const running = await isAgentRunning()

      expect(running).toBe(false)
    })

    it('should return false on error', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Connection failed'))

      const { isAgentRunning } = await import('../../lib/ssh-service')
      const running = await isAgentRunning()

      expect(running).toBe(false)
    })
  })

  describe('addKeyToAgent', () => {
    it('should add key successfully', async () => {
      const mockResult = {
        success: true,
        message: 'Key added to SSH agent successfully',
        needsPassphrase: false,
      }

      vi.mocked(invoke).mockResolvedValueOnce(mockResult)

      const { addKeyToAgent } = await import('../../lib/ssh-service')
      const result = await addKeyToAgent('/Users/test/.ssh/id_ed25519')

      expect(invoke).toHaveBeenCalledWith('add_key_to_agent', {
        keyPath: '/Users/test/.ssh/id_ed25519',
        passphrase: null,
      })
      expect(result.success).toBe(true)
    })

    it('should return needsPassphrase when key is encrypted', async () => {
      const mockResult = {
        success: false,
        message: 'This key requires a passphrase.',
        needsPassphrase: true,
      }

      vi.mocked(invoke).mockResolvedValueOnce(mockResult)

      const { addKeyToAgent } = await import('../../lib/ssh-service')
      const result = await addKeyToAgent('/Users/test/.ssh/id_encrypted')

      expect(result.success).toBe(false)
      expect(result.needsPassphrase).toBe(true)
    })

    it('should add key with passphrase', async () => {
      const mockResult = {
        success: true,
        message: 'Key added to SSH agent successfully',
        needsPassphrase: false,
      }

      vi.mocked(invoke).mockResolvedValueOnce(mockResult)

      const { addKeyToAgent } = await import('../../lib/ssh-service')
      const result = await addKeyToAgent(
        '/Users/test/.ssh/id_encrypted',
        'secret123'
      )

      expect(invoke).toHaveBeenCalledWith('add_key_to_agent', {
        keyPath: '/Users/test/.ssh/id_encrypted',
        passphrase: 'secret123',
      })
      expect(result.success).toBe(true)
    })
  })
})

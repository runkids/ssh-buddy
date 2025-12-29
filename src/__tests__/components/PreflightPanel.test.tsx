import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PreflightPanel } from '../../components/hosts/PreflightPanel'
import type { SSHHostConfig } from '../../lib/ssh-config'
import type {
  PreflightResult,
  PreflightCheck,
} from '../../lib/diagnostic-engine'

// Mock the diagnostic-engine module
vi.mock('../../lib/diagnostic-engine', () => ({
  runPreflightChecks: vi.fn(),
  executeFixAction: vi.fn(),
}))

describe('PreflightPanel', () => {
  const mockHost: SSHHostConfig = {
    Host: 'github',
    HostName: 'github.com',
    User: 'git',
    IdentityFile: '~/.ssh/id_ed25519',
  }

  const mockOnComplete = vi.fn()
  const mockOnContinue = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ========================================
  // Initial State Tests
  // ========================================

  describe('Initial State', () => {
    it('should render initial state with Run Checks button', () => {
      render(
        <PreflightPanel
          host={mockHost}
          onComplete={mockOnComplete}
          onContinue={mockOnContinue}
        />
      )

      expect(screen.getByText('Pre-flight Checks')).toBeInTheDocument()
      expect(screen.getByText('Run Checks')).toBeInTheDocument()
      expect(
        screen.getByText(/Run pre-flight checks to verify/)
      ).toBeInTheDocument()
    })

    it('should not show Re-run button in initial state', () => {
      render(
        <PreflightPanel
          host={mockHost}
          onComplete={mockOnComplete}
          onContinue={mockOnContinue}
        />
      )

      expect(screen.queryByText('Re-run')).not.toBeInTheDocument()
    })
  })

  // ========================================
  // Running Checks Tests
  // ========================================

  describe('Running Checks', () => {
    it('should show loading state when running checks', async () => {
      const { runPreflightChecks } = await import('../../lib/diagnostic-engine')
      vi.mocked(runPreflightChecks).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(createMockResult()), 100)
          )
      )

      render(
        <PreflightPanel
          host={mockHost}
          onComplete={mockOnComplete}
          onContinue={mockOnContinue}
        />
      )

      const runButton = screen.getByText('Run Checks')
      fireEvent.click(runButton)

      await waitFor(() => {
        expect(screen.getByText('Checking...')).toBeInTheDocument()
      })
    })

    it('should call runPreflightChecks with host config', async () => {
      const { runPreflightChecks } = await import('../../lib/diagnostic-engine')
      vi.mocked(runPreflightChecks).mockResolvedValueOnce(createMockResult())

      render(
        <PreflightPanel
          host={mockHost}
          onComplete={mockOnComplete}
          onContinue={mockOnContinue}
        />
      )

      fireEvent.click(screen.getByText('Run Checks'))

      await waitFor(() => {
        expect(runPreflightChecks).toHaveBeenCalledWith(mockHost)
      })
    })

    it('should call onComplete callback after checks complete', async () => {
      const { runPreflightChecks } = await import('../../lib/diagnostic-engine')
      const mockResult = createMockResult()
      vi.mocked(runPreflightChecks).mockResolvedValueOnce(mockResult)

      render(
        <PreflightPanel
          host={mockHost}
          onComplete={mockOnComplete}
          onContinue={mockOnContinue}
        />
      )

      fireEvent.click(screen.getByText('Run Checks'))

      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalledWith(mockResult)
      })
    })
  })

  // ========================================
  // Results Display Tests
  // ========================================

  describe('Results Display', () => {
    it('should show all passed message when all checks pass', async () => {
      const { runPreflightChecks } = await import('../../lib/diagnostic-engine')
      vi.mocked(runPreflightChecks).mockResolvedValueOnce(
        createMockResult(true)
      )

      render(
        <PreflightPanel
          host={mockHost}
          onComplete={mockOnComplete}
          onContinue={mockOnContinue}
        />
      )

      fireEvent.click(screen.getByText('Run Checks'))

      await waitFor(() => {
        expect(screen.getByText('All checks passed')).toBeInTheDocument()
      })
    })

    it('should show failure message when checks fail', async () => {
      const { runPreflightChecks } = await import('../../lib/diagnostic-engine')
      vi.mocked(runPreflightChecks).mockResolvedValueOnce(
        createMockResult(false, true)
      )

      render(
        <PreflightPanel
          host={mockHost}
          onComplete={mockOnComplete}
          onContinue={mockOnContinue}
        />
      )

      fireEvent.click(screen.getByText('Run Checks'))

      await waitFor(() => {
        expect(screen.getByText('Some checks failed')).toBeInTheDocument()
      })
    })

    it('should show warning message when only warnings exist', async () => {
      const { runPreflightChecks } = await import('../../lib/diagnostic-engine')
      vi.mocked(runPreflightChecks).mockResolvedValueOnce(
        createMockResult(false, false, true)
      )

      render(
        <PreflightPanel
          host={mockHost}
          onComplete={mockOnComplete}
          onContinue={mockOnContinue}
        />
      )

      fireEvent.click(screen.getByText('Run Checks'))

      await waitFor(() => {
        expect(screen.getByText('Some warnings found')).toBeInTheDocument()
      })
    })

    it('should show Continue Anyway button when there are errors', async () => {
      const { runPreflightChecks } = await import('../../lib/diagnostic-engine')
      vi.mocked(runPreflightChecks).mockResolvedValueOnce(
        createMockResult(false, true)
      )

      render(
        <PreflightPanel
          host={mockHost}
          onComplete={mockOnComplete}
          onContinue={mockOnContinue}
        />
      )

      fireEvent.click(screen.getByText('Run Checks'))

      await waitFor(() => {
        expect(screen.getByText('Continue Anyway')).toBeInTheDocument()
      })
    })

    it('should show Continue to Test button when all pass', async () => {
      const { runPreflightChecks } = await import('../../lib/diagnostic-engine')
      vi.mocked(runPreflightChecks).mockResolvedValueOnce(
        createMockResult(true)
      )

      render(
        <PreflightPanel
          host={mockHost}
          onComplete={mockOnComplete}
          onContinue={mockOnContinue}
        />
      )

      fireEvent.click(screen.getByText('Run Checks'))

      await waitFor(() => {
        expect(screen.getByText('Continue to Test')).toBeInTheDocument()
      })
    })

    it('should show Re-run button after checks complete', async () => {
      const { runPreflightChecks } = await import('../../lib/diagnostic-engine')
      vi.mocked(runPreflightChecks).mockResolvedValueOnce(
        createMockResult(true)
      )

      render(
        <PreflightPanel
          host={mockHost}
          onComplete={mockOnComplete}
          onContinue={mockOnContinue}
        />
      )

      fireEvent.click(screen.getByText('Run Checks'))

      await waitFor(() => {
        expect(screen.getByText('Re-run')).toBeInTheDocument()
      })
    })
  })

  // ========================================
  // Fix Actions Tests
  // ========================================

  describe('Fix Actions', () => {
    it('should show Fix button for failed checks with fixAction', async () => {
      const { runPreflightChecks } = await import('../../lib/diagnostic-engine')
      vi.mocked(runPreflightChecks).mockResolvedValueOnce(
        createMockResultWithFixableCheck()
      )

      render(
        <PreflightPanel
          host={mockHost}
          onComplete={mockOnComplete}
          onContinue={mockOnContinue}
        />
      )

      fireEvent.click(screen.getByText('Run Checks'))

      await waitFor(() => {
        expect(screen.getByText('Fix')).toBeInTheDocument()
      })
    })

    it('should show Fix All button when there are fixable issues', async () => {
      const { runPreflightChecks } = await import('../../lib/diagnostic-engine')
      vi.mocked(runPreflightChecks).mockResolvedValueOnce(
        createMockResultWithFixableCheck()
      )

      render(
        <PreflightPanel
          host={mockHost}
          onComplete={mockOnComplete}
          onContinue={mockOnContinue}
        />
      )

      fireEvent.click(screen.getByText('Run Checks'))

      await waitFor(() => {
        expect(screen.getByText('Fix All')).toBeInTheDocument()
      })
    })

    it('should call executeFixAction when Fix button is clicked', async () => {
      const { runPreflightChecks, executeFixAction } =
        await import('../../lib/diagnostic-engine')
      const mockResult = createMockResultWithFixableCheck()
      vi.mocked(runPreflightChecks).mockResolvedValueOnce(mockResult)
      vi.mocked(executeFixAction).mockResolvedValueOnce({
        success: true,
        message: 'Fixed',
      })
      // Mock re-run after fix
      vi.mocked(runPreflightChecks).mockResolvedValueOnce(
        createMockResult(true)
      )

      render(
        <PreflightPanel
          host={mockHost}
          onComplete={mockOnComplete}
          onContinue={mockOnContinue}
        />
      )

      fireEvent.click(screen.getByText('Run Checks'))

      await waitFor(() => {
        expect(screen.getByText('Fix')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Fix'))

      await waitFor(() => {
        expect(executeFixAction).toHaveBeenCalled()
      })
    })
  })

  // ========================================
  // Passphrase Dialog Tests
  // ========================================

  describe('Passphrase Dialog', () => {
    it('should show passphrase dialog when fix requires passphrase', async () => {
      const { runPreflightChecks, executeFixAction } =
        await import('../../lib/diagnostic-engine')
      vi.mocked(runPreflightChecks).mockResolvedValueOnce(
        createMockResultWithFixableCheck('ssh-add')
      )
      vi.mocked(executeFixAction).mockResolvedValueOnce({
        success: false,
        message: 'Requires passphrase',
        needsPassphrase: true,
        keyPath: '/Users/test/.ssh/id_encrypted',
      })

      render(
        <PreflightPanel
          host={mockHost}
          onComplete={mockOnComplete}
          onContinue={mockOnContinue}
        />
      )

      fireEvent.click(screen.getByText('Run Checks'))

      await waitFor(() => {
        expect(screen.getByText('Fix')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Fix'))

      await waitFor(() => {
        expect(screen.getByText('Enter Passphrase')).toBeInTheDocument()
      })
    })

    it('should have password input and Add to Agent button', async () => {
      const { runPreflightChecks, executeFixAction } =
        await import('../../lib/diagnostic-engine')
      vi.mocked(runPreflightChecks).mockResolvedValueOnce(
        createMockResultWithFixableCheck('ssh-add')
      )
      vi.mocked(executeFixAction).mockResolvedValueOnce({
        success: false,
        message: 'Requires passphrase',
        needsPassphrase: true,
        keyPath: '/Users/test/.ssh/id_encrypted',
      })

      render(
        <PreflightPanel
          host={mockHost}
          onComplete={mockOnComplete}
          onContinue={mockOnContinue}
        />
      )

      fireEvent.click(screen.getByText('Run Checks'))
      await waitFor(() => screen.getByText('Fix'))
      fireEvent.click(screen.getByText('Fix'))

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText('Enter passphrase')
        ).toBeInTheDocument()
        expect(screen.getByText('Add to Agent')).toBeInTheDocument()
        expect(screen.getByText('Cancel')).toBeInTheDocument()
      })
    })
  })

  // ========================================
  // Continue Button Tests
  // ========================================

  describe('Continue Button', () => {
    it('should call onContinue when continue button is clicked', async () => {
      const { runPreflightChecks } = await import('../../lib/diagnostic-engine')
      vi.mocked(runPreflightChecks).mockResolvedValueOnce(
        createMockResult(true)
      )

      render(
        <PreflightPanel
          host={mockHost}
          onComplete={mockOnComplete}
          onContinue={mockOnContinue}
        />
      )

      fireEvent.click(screen.getByText('Run Checks'))

      await waitFor(() => {
        expect(screen.getByText('Continue to Test')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Continue to Test'))

      expect(mockOnContinue).toHaveBeenCalled()
    })
  })
})

// ========================================
// Helper Functions
// ========================================

function createMockResult(
  allPassed = true,
  hasErrors = false,
  hasWarnings = false
): PreflightResult {
  const checks: PreflightCheck[] = [
    {
      id: 'identity_file_exists',
      name: 'Identity File',
      description: 'Check if identity file exists',
      status: allPassed ? 'passed' : hasErrors ? 'failed' : 'passed',
      message: allPassed ? 'File exists' : 'File not found',
    },
    {
      id: 'identity_file_permissions',
      name: 'File Permissions',
      description: 'Check file permissions',
      status: allPassed
        ? 'passed'
        : hasWarnings
          ? 'warning'
          : hasErrors
            ? 'failed'
            : 'passed',
      message: allPassed ? 'Permissions correct' : 'Permissions issue',
    },
  ]

  return {
    checks,
    allPassed,
    hasWarnings,
    hasErrors,
    timestamp: Date.now(),
  }
}

function createMockResultWithFixableCheck(
  fixType: 'chmod' | 'ssh-add' = 'chmod'
): PreflightResult {
  const checks: PreflightCheck[] = [
    {
      id: 'identity_file_exists',
      name: 'Identity File',
      description: 'Check if identity file exists',
      status: 'passed',
      message: 'File exists',
    },
    {
      id: 'key_in_agent',
      name: 'Key in Agent',
      description: 'Check if key is loaded in agent',
      status: 'warning',
      message: 'Key not in agent',
      fixAction: {
        id: 'add-to-agent',
        label: 'Add to Agent',
        description: 'Load key into SSH agent',
        type: fixType,
        params: { keyPath: '/Users/test/.ssh/id_ed25519' },
      },
    },
  ]

  return {
    checks,
    allPassed: false,
    hasWarnings: true,
    hasErrors: false,
    timestamp: Date.now(),
  }
}

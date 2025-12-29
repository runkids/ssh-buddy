/**
 * Tauri API Mocks for Testing
 */
import { vi } from 'vitest'

export const mockInvoke = vi.fn()

// Re-export for direct imports
export { mockInvoke as invoke }

// Helper to reset all mocks
export function resetTauriMocks(): void {
  mockInvoke.mockReset()
}

// Helper to setup common mock responses
export function setupMockResponses(responses: Record<string, unknown>): void {
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd in responses) {
      return Promise.resolve(responses[cmd])
    }
    return Promise.reject(new Error(`Unknown command: ${cmd}`))
  })
}

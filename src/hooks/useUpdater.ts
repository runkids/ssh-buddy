import { useState, useCallback } from 'react'
import { check, Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'complete'
  | 'error'
  | 'up_to_date'

export interface UpdateProgress {
  downloadedBytes: number
  totalBytes: number | null
}

export interface UpdateInfo {
  version: string
  releaseNotes: string | null
}

export interface UseUpdaterReturn {
  state: UpdateState
  progress: UpdateProgress
  updateInfo: UpdateInfo | null
  error: string | null
  isDevMode: boolean
  checkForUpdates: () => Promise<void>
  startUpdate: () => Promise<void>
  restartApp: () => Promise<void>
  resetState: () => void
}

// Simulated update info for dev mode
const DEV_MOCK_UPDATE: UpdateInfo = {
  version: '99.0.0',
  releaseNotes: `### ✨ New Features

- Added dark mode support
- New SSH key import wizard
- Quick connect from menu bar

### 🐛 Bug Fixes

- Fixed connection timeout issues
- Resolved key passphrase caching

### 🔧 Improvements

- Better performance on large config files
- Updated dependencies

---
*This is a simulated update for development testing.*`,
}

const DEV_MOCK_TOTAL_BYTES = 15 * 1024 * 1024 // 15 MB simulated download

export function useUpdater(): UseUpdaterReturn {
  const isDevMode = import.meta.env.DEV

  const [state, setState] = useState<UpdateState>('idle')
  const [progress, setProgress] = useState<UpdateProgress>({
    downloadedBytes: 0,
    totalBytes: null,
  })
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updateInstance, setUpdateInstance] = useState<Update | null>(null)

  const resetState = useCallback(() => {
    setState('idle')
    setProgress({ downloadedBytes: 0, totalBytes: null })
    setUpdateInfo(null)
    setError(null)
    setUpdateInstance(null)
  }, [])

  // Simulate checking for updates in dev mode
  const simulateCheckForUpdates = useCallback(async () => {
    setState('checking')
    setError(null)

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1500))

    setUpdateInfo(DEV_MOCK_UPDATE)
    setState('available')
  }, [])

  // Simulate download and install in dev mode
  const simulateStartUpdate = useCallback(async () => {
    setState('downloading')
    setProgress({ downloadedBytes: 0, totalBytes: DEV_MOCK_TOTAL_BYTES })

    const chunkSize = DEV_MOCK_TOTAL_BYTES / 20 // 20 chunks
    let downloaded = 0

    for (let i = 0; i < 20; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      downloaded += chunkSize
      setProgress({
        downloadedBytes: Math.min(downloaded, DEV_MOCK_TOTAL_BYTES),
        totalBytes: DEV_MOCK_TOTAL_BYTES,
      })
    }

    setState('installing')
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setState('complete')
  }, [])

  const checkForUpdates = useCallback(async () => {
    // In dev mode, use simulation
    if (isDevMode) {
      return simulateCheckForUpdates()
    }

    try {
      setState('checking')
      setError(null)

      const update = await check()

      if (update) {
        setUpdateInstance(update)
        setUpdateInfo({
          version: update.version,
          releaseNotes: update.body ?? null,
        })
        setState('available')
      } else {
        setState('up_to_date')
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to check for updates'
      )
      setState('error')
    }
  }, [isDevMode, simulateCheckForUpdates])

  const startUpdate = useCallback(async () => {
    // In dev mode, use simulation
    if (isDevMode) {
      return simulateStartUpdate()
    }

    if (!updateInstance) {
      return
    }

    try {
      setState('downloading')
      setProgress({ downloadedBytes: 0, totalBytes: null })

      await updateInstance.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            setProgress({
              downloadedBytes: 0,
              totalBytes: event.data.contentLength ?? null,
            })
            break
          case 'Progress':
            setProgress((prev) => ({
              ...prev,
              downloadedBytes: prev.downloadedBytes + event.data.chunkLength,
            }))
            break
          case 'Finished':
            setProgress((prev) => ({
              ...prev,
              downloadedBytes: prev.totalBytes ?? prev.downloadedBytes,
            }))
            setState('installing')
            break
        }
      })

      setState('complete')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install update')
      setState('error')
    }
  }, [isDevMode, updateInstance, simulateStartUpdate])

  const restartApp = useCallback(async () => {
    // In dev mode, just reset state (can't actually restart)
    if (isDevMode) {
      resetState()
      return
    }

    try {
      await relaunch()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to restart application'
      )
      setState('error')
    }
  }, [isDevMode, resetState])

  return {
    state,
    progress,
    updateInfo,
    error,
    isDevMode,
    checkForUpdates,
    startUpdate,
    restartApp,
    resetState,
  }
}

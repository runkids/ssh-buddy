import { useState, useEffect } from 'react'
import { Terminal } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getVersion } from '@tauri-apps/api/app'

interface TitleBarProps {
  onHelpClick?: () => void
}

export function TitleBar({ onHelpClick }: TitleBarProps) {
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion('dev'))
  }, [])

  const handleMouseDown = async (e: React.MouseEvent) => {
    // Only handle left mouse button
    if (e.buttons !== 1) return

    if (e.detail === 2) {
      // Double click to toggle maximize
      await getCurrentWindow().toggleMaximize()
    } else {
      // Single click to start dragging
      await getCurrentWindow().startDragging()
    }
  }

  const handleLogoClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onHelpClick?.()
  }

  return (
    <header
      onMouseDown={handleMouseDown}
      className="flex items-center border-b-2 border-primary/30 bg-card/80 h-12 flex-shrink-0 backdrop-blur-sm"
    >
      {/* Left: Space for macOS traffic lights */}
      <div className="w-20 h-full" />

      {/* Center: Draggable region with app title */}
      <div className="flex-1 h-full flex items-center justify-center">
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-primary animate-terminal-pulse" />
          </div>

          {/* Terminal icon with glow */}
          <div className="flex items-center gap-2 text-primary">
            <Terminal className="h-4 w-4" />
            <span className="text-sm font-semibold tracking-wide text-glow-sm">
              SSH_BUDDY
            </span>
          </div>

          {/* Version badge */}
          {version && (
            <span className="text-[10px] px-1.5 py-0.5 border-2 border-primary/30 text-primary/60 font-medium">
              v{version}
            </span>
          )}
        </div>
      </div>

      {/* Right: Mascot - clickable for help */}
      <div className="w-28 h-full flex items-center justify-start overflow-hidden">
        <button
          onClick={handleLogoClick}
          className="h-7 w-7 cursor-pointer hover:scale-110 transition-transform"
          title="Help & Guide"
        >
          <img
            src="/logo.png"
            alt="SSH Buddy"
            className="h-full w-full object-contain opacity-70 hover:opacity-100 transition-opacity animate-walk"
          />
        </button>
      </div>
    </header>
  )
}

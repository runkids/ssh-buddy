import { Key, Shield } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SkeletonList } from '@/components/common'
import type { SSHKeyInfo } from '@/lib/ssh-service'
import { cn } from '@/lib/utils'

interface KeyListProps {
  keys: SSHKeyInfo[]
  selectedKey: string | null
  onSelectKey: (keyName: string) => void
  loading?: boolean
}

const keyTypeColors: Record<string, string> = {
  ed25519: 'text-emerald-400 bg-emerald-400/10',
  rsa: 'text-blue-400 bg-blue-400/10',
  ecdsa: 'text-amber-400 bg-amber-400/10',
  dsa: 'text-red-400 bg-red-400/10',
  unknown: 'text-muted-foreground bg-muted',
}

export function KeyList({
  keys,
  selectedKey,
  onSelectKey,
  loading,
}: KeyListProps) {
  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <SkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <div className="flex h-10 w-10 items-center justify-center bg-primary/10 border-brutal border-primary/30 mb-3 shadow-brutal-sm">
                <Key className="h-5 w-5 text-primary/50" />
              </div>
              <p className="text-sm text-primary/70 mb-1">// NO_KEYS_FOUND</p>
              <p className="text-xs text-muted-foreground">
                Press [+] to generate key
              </p>
            </div>
          ) : (
            keys.map((key, index) => {
              const isSelected = selectedKey === key.name
              return (
                <button
                  key={key.name}
                  onClick={() => onSelectKey(key.name)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-all duration-100 group',
                    'border-2',
                    isSelected
                      ? 'bg-primary/10 border-primary/50 shadow-brutal-sm'
                      : 'border-transparent hover:bg-primary/5 hover:border-primary/30'
                  )}
                >
                  {/* Index number - terminal style */}
                  <span
                    className={cn(
                      'text-[10px] w-4 text-right font-mono',
                      isSelected ? 'text-primary' : 'text-muted-foreground/50'
                    )}
                  >
                    {String(index).padStart(2, '0')}
                  </span>

                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center transition-all border-2',
                      isSelected
                        ? 'bg-primary/20 text-primary border-primary/40'
                        : 'bg-muted/50 text-muted-foreground border-transparent group-hover:border-primary/30'
                    )}
                  >
                    <Shield className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p
                      className={cn(
                        'font-medium truncate',
                        isSelected
                          ? 'text-primary text-glow-sm'
                          : 'text-foreground/90 group-hover:text-primary/90'
                      )}
                    >
                      {key.name}
                    </p>
                    {key.comment && (
                      <p
                        className={cn(
                          'text-xs truncate',
                          isSelected
                            ? 'text-primary/60'
                            : 'text-muted-foreground'
                        )}
                      >
                        {key.comment}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 px-2 py-0.5 text-xs font-medium uppercase border border-current/20',
                      keyTypeColors[key.type] || keyTypeColors.unknown
                    )}
                  >
                    {key.type}
                  </span>

                  {/* Selection indicator */}
                  {isSelected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-terminal-pulse" />
                  )}
                </button>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

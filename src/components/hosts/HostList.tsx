import { useState, useMemo } from 'react'
import { Server, Globe, Star, Tag } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SkeletonList } from '@/components/common'
import { HostFilters, type SortOption } from './HostFilters'
import type { SSHHostConfig } from '@/lib/ssh-config'
import type { HostMetadata } from '@/lib/metadata-service'
import { cn } from '@/lib/utils'

interface HostListProps {
  hosts: SSHHostConfig[]
  selectedHost: string | null
  onSelectHost: (hostName: string) => void
  loading?: boolean
  // Metadata integration
  getHostMetadata?: (hostAlias: string) => HostMetadata | null
  allTags?: string[]
}

export function HostList({
  hosts,
  selectedHost,
  onSelectHost,
  loading,
  getHostMetadata,
  allTags = [],
}: HostListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>('name')

  // Filter and sort hosts
  const filteredHosts = useMemo(() => {
    let result = [...hosts]

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (host) =>
          host.Host.toLowerCase().includes(query) ||
          host.HostName?.toLowerCase().includes(query) ||
          host.User?.toLowerCase().includes(query)
      )
    }

    // Tag filter
    if (selectedTags.length > 0 && getHostMetadata) {
      result = result.filter((host) => {
        const meta = getHostMetadata(host.Host)
        if (!meta) return false
        return selectedTags.every((tag) => meta.tags.includes(tag))
      })
    }

    // Favorites filter
    if (showFavoritesOnly && getHostMetadata) {
      result = result.filter((host) => {
        const meta = getHostMetadata(host.Host)
        return meta?.isFavorite === true
      })
    }

    // Sort
    result.sort((a, b) => {
      const metaA = getHostMetadata?.(a.Host)
      const metaB = getHostMetadata?.(b.Host)

      switch (sortBy) {
        case 'lastUsed': {
          const lastA = metaA?.lastUsed || 0
          const lastB = metaB?.lastUsed || 0
          return lastB - lastA // Most recent first
        }
        case 'favorites': {
          const favA = metaA?.isFavorite ? 1 : 0
          const favB = metaB?.isFavorite ? 1 : 0
          if (favA !== favB) return favB - favA // Favorites first
          return a.Host.localeCompare(b.Host)
        }
        case 'name':
        default:
          return a.Host.localeCompare(b.Host)
      }
    })

    return result
  }, [
    hosts,
    searchQuery,
    selectedTags,
    showFavoritesOnly,
    sortBy,
    getHostMetadata,
  ])

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <SkeletonList count={5} />
      </div>
    )
  }

  const hasFilters = searchQuery || selectedTags.length > 0 || showFavoritesOnly

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <HostFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedTags={selectedTags}
        onTagSelect={(tag) => setSelectedTags((prev) => [...prev, tag])}
        onTagDeselect={(tag) =>
          setSelectedTags((prev) => prev.filter((t) => t !== tag))
        }
        availableTags={allTags}
        showFavoritesOnly={showFavoritesOnly}
        onFavoritesToggle={() => setShowFavoritesOnly(!showFavoritesOnly)}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {hosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <div className="flex h-10 w-10 items-center justify-center bg-primary/10 border-brutal border-primary/30 mb-3 shadow-brutal-sm">
                <Server className="h-5 w-5 text-primary/50" />
              </div>
              <p className="text-sm text-primary/70 mb-1">// NO_HOSTS_FOUND</p>
              <p className="text-xs text-muted-foreground">
                Press [+] to add host
              </p>
            </div>
          ) : filteredHosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <div className="flex h-10 w-10 items-center justify-center bg-primary/10 border-brutal border-primary/30 mb-3 shadow-brutal-sm">
                <Server className="h-5 w-5 text-primary/50" />
              </div>
              <p className="text-sm text-primary/70 mb-1">// NO_MATCH</p>
              <p className="text-xs text-muted-foreground">
                Adjust filters to expand search
              </p>
            </div>
          ) : (
            filteredHosts.map((host, index) => {
              const meta = getHostMetadata?.(host.Host)
              const isSelected = selectedHost === host.Host
              return (
                <button
                  key={host.Host}
                  onClick={() => onSelectHost(host.Host)}
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
                      'flex h-8 w-8 shrink-0 items-center justify-center transition-all relative border-2',
                      isSelected
                        ? 'bg-primary/20 text-primary border-primary/40'
                        : 'bg-muted/50 text-muted-foreground border-transparent group-hover:border-primary/30'
                    )}
                  >
                    <Server className="h-4 w-4" />
                    {meta?.isFavorite && (
                      <Star className="absolute -top-1 -right-1 h-3 w-3 fill-primary text-primary" />
                    )}
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
                      {host.Host}
                    </p>
                    <div className="flex items-center gap-1.5">
                      {host.HostName && (
                        <p
                          className={cn(
                            'text-xs truncate flex items-center gap-1',
                            isSelected
                              ? 'text-primary/60'
                              : 'text-muted-foreground'
                          )}
                        >
                          <Globe className="h-3 w-3" />
                          {host.HostName}
                        </p>
                      )}
                      {meta && meta.tags.length > 0 && (
                        <div className="flex items-center gap-1 ml-auto">
                          <Tag
                            className={cn(
                              'h-2.5 w-2.5',
                              isSelected
                                ? 'text-primary/50'
                                : 'text-muted-foreground'
                            )}
                          />
                          <span
                            className={cn(
                              'text-[10px]',
                              isSelected
                                ? 'text-primary/50'
                                : 'text-muted-foreground'
                            )}
                          >
                            {meta.tags.length}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Connection indicator */}
                  {isSelected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-terminal-pulse" />
                  )}
                </button>
              )
            })
          )}
        </div>
      </ScrollArea>

      {/* Filter Status */}
      {hasFilters && filteredHosts.length > 0 && (
        <div className="px-3 py-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground text-center">
            Showing {filteredHosts.length} of {hosts.length} hosts
          </p>
        </div>
      )}
    </div>
  )
}

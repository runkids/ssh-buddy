import React, { useState, useRef, useCallback, useEffect } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import {
  Server,
  Key,
  Plus,
  GripVertical,
  Settings,
  RotateCcw,
  FileText,
  ChevronDown,
  Shield,
} from 'lucide-react'
import { TitleBar } from '@/components/layout'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HostList } from '@/components/hosts/HostList'
import { HostDetail } from '@/components/hosts/HostDetail'
import { HostForm } from '@/components/hosts/HostForm'
import { HostTemplates } from '@/components/hosts/HostTemplates'
import { KeyList } from '@/components/keys/KeyList'
import { KeyDetail } from '@/components/keys/KeyDetail'
import { SecurityPanel } from '@/components/keys/SecurityPanel'
import {
  KeyGenerator,
  type GenerateKeyOptions,
} from '@/components/keys/KeyGenerator'
import { useSSHConfig } from '@/hooks/useSSHConfig'
import { useSSHKeys } from '@/hooks/useSSHKeys'
import { useMetadata } from '@/hooks/useMetadata'
import type { SSHHostConfig } from '@/lib/ssh-config'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/common'
import { ToastProvider, useToast } from '@/components/common'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { TipsProvider, useTips } from '@/hooks/useTips'
import { Onboarding } from '@/components/onboarding'
import { UpdateDialog } from '@/components/ui/UpdateDialog'
import { useUpdater } from '@/hooks/useUpdater'
import { cn } from '@/lib/utils'

type Tab = 'hosts' | 'keys' | 'security'

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>('hosts')
  const [selectedHost, setSelectedHost] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState<string>('0.0.0')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [hostFormOpen, setHostFormOpen] = useState(false)
  const [hostFormMode, setHostFormMode] = useState<'add' | 'edit'>('add')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'host' | 'key'
    name: string
  } | null>(null)
  const [keyGeneratorOpen, setKeyGeneratorOpen] = useState(false)
  const [hostTemplatesOpen, setHostTemplatesOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(380) // Default 380px
  const [isResizing, setIsResizing] = useState(false)
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const resizeRef = useRef<HTMLDivElement>(null)

  // Updater hook
  const {
    state: updateState,
    progress: updateProgress,
    updateInfo,
    error: updateError,
    isDevMode,
    checkForUpdates,
    startUpdate,
    restartApp,
    resetState: resetUpdateState,
  } = useUpdater()

  // Resize handler
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return
      // Calculate new width: mouse position - icon rail width (64px)
      const newWidth = e.clientX - 64
      // Clamp between min (160px) and max (400px)
      setSidebarWidth(Math.max(160, Math.min(400, newWidth)))
    },
    [isResizing]
  )

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
  }, [])

  // Add/remove event listeners for resize
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    } else {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  // Fetch app version from Tauri
  useEffect(() => {
    getVersion().then(setAppVersion).catch(console.error)
  }, [])

  const { addToast } = useToast()
  const { resetAllTips } = useTips()
  const [showSettings, setShowSettings] = useState(false)

  const handleResetTips = () => {
    resetAllTips()
    addToast({
      type: 'success',
      title: 'Tips Reset',
      description: 'All tips will now appear again when triggered',
    })
  }

  const {
    hosts,
    loading: hostsLoading,
    addHost,
    updateHost,
    deleteHost,
  } = useSSHConfig()

  const {
    keys,
    loading: keysLoading,
    getPublicKey,
    deleteKey,
    generateKey,
  } = useSSHKeys()

  const {
    getHostMeta,
    allTags,
    addTags,
    removeTags,
    toggleFavorite,
    addTag: createTag,
    removeTag: deleteTagGlobally,
    deleteHostMeta,
  } = useMetadata()

  const currentHost = hosts.find((h) => h.Host === selectedHost)
  const currentKey = keys.find((k) => k.name === selectedKey)
  const currentHostMetadata = selectedHost ? getHostMeta(selectedHost) : null

  const handleAddHost = () => {
    setHostFormMode('add')
    setHostFormOpen(true)
  }

  const handleEditHost = () => {
    setHostFormMode('edit')
    setHostFormOpen(true)
  }

  const handleDeleteHost = () => {
    if (selectedHost) {
      setDeleteTarget({ type: 'host', name: selectedHost })
      setDeleteDialogOpen(true)
    }
  }

  const handleDeleteKey = () => {
    if (selectedKey) {
      setDeleteTarget({ type: 'key', name: selectedKey })
      setDeleteDialogOpen(true)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return

    setIsDeleting(true)
    try {
      if (deleteTarget.type === 'host') {
        await deleteHost(deleteTarget.name)
        // Also delete host metadata
        await deleteHostMeta(deleteTarget.name)
        setSelectedHost(null)
        addToast({
          type: 'success',
          title: 'Host Deleted',
          description: `${deleteTarget.name} has been removed from config`,
        })
      } else {
        await deleteKey(deleteTarget.name)
        setSelectedKey(null)
        addToast({
          type: 'success',
          title: 'Key Deleted',
          description: `${deleteTarget.name} key pair has been deleted`,
        })
      }
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Delete Failed',
        description:
          error instanceof Error ? error.message : 'An error occurred',
      })
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setDeleteTarget(null)
    }
  }

  const handleHostSubmit = async (host: SSHHostConfig) => {
    try {
      if (hostFormMode === 'add') {
        await addHost(host)
        setSelectedHost(host.Host)
        addToast({
          type: 'success',
          title: 'Host Added',
          description: `${host.Host} has been added to config`,
        })
      } else if (selectedHost) {
        await updateHost(selectedHost, host)
        addToast({
          type: 'success',
          title: 'Host Updated',
          description: `${host.Host} settings saved`,
        })
      }
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Save Failed',
        description:
          error instanceof Error ? error.message : 'An error occurred',
      })
      throw error
    }
  }

  const handleGenerateKey = async (options: GenerateKeyOptions) => {
    try {
      await generateKey({
        name: options.name,
        type: options.type,
        comment: options.comment || undefined,
        passphrase: options.passphrase || undefined,
      })
      setSelectedKey(options.name)
      addToast({
        type: 'success',
        title: 'Key Generated',
        description: `${options.name} key pair has been created`,
      })
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Generation Failed',
        description:
          error instanceof Error ? error.message : 'An error occurred',
      })
      throw error
    }
  }

  // Metadata handlers for current host
  const handleToggleFavorite = async () => {
    if (!selectedHost) return
    await toggleFavorite(selectedHost)
  }

  const handleAddTag = async (tag: string) => {
    if (!selectedHost) return
    try {
      await addTags(selectedHost, [tag])
      addToast({
        type: 'success',
        title: 'Tag Added',
        description: `Added tag "${tag}" to ${selectedHost}`,
      })
    } catch (error) {
      console.error('Failed to add tag:', error)
      addToast({
        type: 'error',
        title: 'Failed to Add Tag',
        description:
          error instanceof Error ? error.message : 'An error occurred',
      })
    }
  }

  const handleRemoveTag = async (tag: string) => {
    if (!selectedHost) return
    try {
      await removeTags(selectedHost, [tag])
      addToast({
        type: 'success',
        title: 'Tag Removed',
        description: `Removed tag "${tag}" from ${selectedHost}`,
      })
    } catch (error) {
      console.error('Failed to remove tag:', error)
      addToast({
        type: 'error',
        title: 'Failed to Remove Tag',
        description:
          error instanceof Error ? error.message : 'An error occurred',
      })
    }
  }

  const handleCreateTag = async (tag: string) => {
    try {
      await createTag(tag)
    } catch (error) {
      console.error('Failed to create tag:', error)
      addToast({
        type: 'error',
        title: 'Failed to Create Tag',
        description:
          error instanceof Error ? error.message : 'An error occurred',
      })
    }
  }

  const handleDeleteTag = async (tag: string) => {
    try {
      await deleteTagGlobally(tag)
      addToast({
        type: 'success',
        title: 'Tag Deleted',
        description: `Tag "${tag}" has been deleted from all hosts`,
      })
    } catch (error) {
      console.error('Failed to delete tag:', error)
      addToast({
        type: 'error',
        title: 'Failed to Delete Tag',
        description:
          error instanceof Error ? error.message : 'An error occurred',
      })
    }
  }

  // Template handler
  const handleTemplateSelect = async (config: SSHHostConfig) => {
    try {
      await addHost(config)
      setSelectedHost(config.Host)
      addToast({
        type: 'success',
        title: 'Host Created',
        description: `${config.Host} has been created from template`,
      })
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Creation Failed',
        description:
          error instanceof Error ? error.message : 'An error occurred',
      })
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden select-none">
      {/* Custom Title Bar */}
      <TitleBar onHelpClick={() => setOnboardingOpen(true)} />

      {/* Main App Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Icon Rail - Always visible */}
        <div className="flex flex-col w-16 border-r-2 border-primary/20 bg-card/50">
          {/* Nav Icons */}
          <div className="flex-1 flex flex-col items-center py-4 gap-2">
            <button
              onClick={() => setActiveTab('hosts')}
              className={cn(
                'flex h-10 w-10 items-center justify-center transition-all duration-100 border-2',
                activeTab === 'hosts'
                  ? 'bg-primary text-primary-foreground border-primary shadow-brutal-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted border-transparent hover:border-primary/30'
              )}
              title="Hosts"
            >
              <Server className="h-5 w-5" />
            </button>
            <button
              onClick={() => setActiveTab('keys')}
              className={cn(
                'flex h-10 w-10 items-center justify-center transition-all duration-100 border-2',
                activeTab === 'keys'
                  ? 'bg-primary text-primary-foreground border-primary shadow-brutal-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted border-transparent hover:border-primary/30'
              )}
              title="Keys"
            >
              <Key className="h-5 w-5" />
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={cn(
                'flex h-10 w-10 items-center justify-center transition-all duration-100 border-2',
                activeTab === 'security'
                  ? 'bg-primary text-primary-foreground border-primary shadow-brutal-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted border-transparent hover:border-primary/30'
              )}
              title="Security"
            >
              <Shield className="h-5 w-5" />
            </button>
          </div>

          {/* Bottom Section - App Menu */}
          <div className="flex flex-col items-center py-3 border-t border-border">
            {/* App Menu - Logo with Dropdown */}
            <DropdownMenu open={showSettings} onOpenChange={setShowSettings}>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    'relative group flex flex-col items-center gap-1.5 p-1.5 transition-all duration-300',
                    'hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                    showSettings && 'bg-muted/50',
                    updateState === 'available' && 'animate-pulse-subtle'
                  )}
                  title={
                    isDevMode
                      ? 'App Menu (Dev Mode)'
                      : updateState === 'available'
                        ? 'Update Available!'
                        : 'App Menu'
                  }
                >
                  {/* Logo Container */}
                  <div
                    className={cn(
                      'relative w-10 h-10 overflow-hidden transition-all duration-300',
                      'border-2 border-primary/20',
                      updateState === 'available'
                        ? 'border-yellow-500/60 shadow-brutal-warning'
                        : updateState === 'complete'
                          ? 'border-green-500/60 shadow-brutal-sm'
                          : showSettings
                            ? 'border-primary/40'
                            : 'border-primary/20 group-hover:border-primary/40'
                    )}
                  >
                    <img
                      src="/logo.png"
                      alt="SSH Buddy"
                      className="w-full h-full object-cover"
                    />

                    {/* Update Available Overlay */}
                    {updateState === 'available' && (
                      <div className="absolute inset-0 bg-yellow-500/10 animate-pulse" />
                    )}
                  </div>

                  {/* Notification Dot */}
                  {updateState === 'available' && (
                    <span
                      className={cn(
                        'absolute top-0.5 right-0.5 flex h-3.5 w-3.5',
                        'items-center justify-center'
                      )}
                    >
                      <span className="absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75 animate-ping" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.8)]" />
                    </span>
                  )}

                  {/* Complete Indicator */}
                  {updateState === 'complete' && (
                    <span
                      className={cn(
                        'absolute top-0.5 right-0.5 flex h-3.5 w-3.5',
                        'items-center justify-center rounded-full',
                        'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.8)]'
                      )}
                    >
                      <span className="text-[8px] text-white font-bold">!</span>
                    </span>
                  )}

                  {/* Version Number */}
                  <span
                    className={cn(
                      'text-[9px] font-mono leading-none transition-colors duration-200',
                      updateState === 'available'
                        ? 'text-yellow-400'
                        : 'text-muted-foreground group-hover:text-foreground'
                    )}
                  >
                    v{appVersion}
                  </span>
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                side="right"
                align="end"
                sideOffset={8}
                className="w-52"
              >
                {/* Update Section */}
                <DropdownMenuItem
                  onClick={() => {
                    setUpdateDialogOpen(true)
                    if (!isDevMode && updateState === 'idle') {
                      checkForUpdates()
                    }
                    setShowSettings(false)
                  }}
                  className={cn(
                    'gap-3',
                    updateState === 'available' &&
                      'text-yellow-600 dark:text-yellow-400'
                  )}
                >
                  {updateState === 'available' ? (
                    <>
                      <div className="relative">
                        <RotateCcw className="h-4 w-4" />
                        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-yellow-400" />
                      </div>
                      <span className="flex-1">Update Available</span>
                      <span className="text-[10px] font-mono opacity-70">
                        {updateInfo?.version}
                      </span>
                    </>
                  ) : updateState === 'complete' ? (
                    <>
                      <RotateCcw className="h-4 w-4 text-green-500" />
                      <span className="flex-1 text-green-600 dark:text-green-400">
                        Restart to Update
                      </span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4" />
                      <span>Check for Updates</span>
                    </>
                  )}
                </DropdownMenuItem>

                <div className="h-px bg-border my-1" />

                {/* Settings Section */}
                <DropdownMenuItem
                  onClick={() => {
                    handleResetTips()
                    setShowSettings(false)
                  }}
                  className="gap-3"
                >
                  <Settings className="h-4 w-4" />
                  <span>Reset All Tips</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Expandable Panel - Hidden for Security tab */}
        {activeTab !== 'security' && (
          <div
            className="flex flex-col border-r-2 border-primary/20 bg-card"
            style={{ width: `${sidebarWidth}px` }}
          >
            {/* Panel Header */}
            <div className="flex h-12 items-center justify-between px-4 border-b-2 border-primary/20">
              <div className="flex items-center gap-2">
                {activeTab === 'hosts' ? (
                  <Server className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Key className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium text-foreground">
                  {activeTab === 'hosts' ? 'SSH Hosts' : 'SSH Keys'}
                </span>
                <span className="text-xs text-muted-foreground/80 tabular-nums">
                  ({activeTab === 'hosts' ? hosts.length : keys.length})
                </span>
              </div>
              {activeTab === 'hosts' ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                      <ChevronDown className="h-3 w-3 ml-0.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={handleAddHost}>
                      <Plus className="h-4 w-4 mr-2" />
                      New Host
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setHostTemplatesOpen(true)}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      From Template
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setKeyGeneratorOpen(true)}
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Generate
                </Button>
              )}
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'hosts' ? (
                <HostList
                  hosts={hosts}
                  selectedHost={selectedHost}
                  onSelectHost={setSelectedHost}
                  loading={hostsLoading}
                  getHostMetadata={getHostMeta}
                  allTags={allTags}
                />
              ) : (
                <KeyList
                  keys={keys}
                  selectedKey={selectedKey}
                  onSelectKey={setSelectedKey}
                  loading={keysLoading}
                />
              )}
            </div>
          </div>
        )}

        {/* Resize Handle - Hidden for Security tab */}
        {activeTab !== 'security' && (
          <div
            ref={resizeRef}
            onMouseDown={handleMouseDown}
            className={cn(
              'w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors flex items-center justify-center group',
              isResizing && 'bg-primary'
            )}
          >
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-hidden bg-background relative">
          <ScrollArea className="h-full">
            <div className="p-8 w-full">
              {activeTab === 'hosts' ? (
                currentHost ? (
                  <div className="animate-fade-in w-full">
                    <HostDetail
                      host={currentHost}
                      onEdit={handleEditHost}
                      onDelete={handleDeleteHost}
                      metadata={currentHostMetadata}
                      allTags={allTags}
                      onToggleFavorite={handleToggleFavorite}
                      onAddTag={handleAddTag}
                      onRemoveTag={handleRemoveTag}
                      onCreateTag={handleCreateTag}
                      onDeleteTag={handleDeleteTag}
                    />
                  </div>
                ) : (
                  <EmptyState
                    icon={Server}
                    title="No Host Selected"
                    description="Select a host from the list to view its details, or create a new host configuration."
                    action={{
                      label: 'Add Host',
                      onClick: handleAddHost,
                    }}
                    secondaryAction={{
                      label: 'Use Template',
                      onClick: () => setHostTemplatesOpen(true),
                    }}
                  />
                )
              ) : activeTab === 'keys' ? (
                currentKey ? (
                  <div className="animate-fade-in w-full">
                    <KeyDetail
                      keyInfo={currentKey}
                      onDelete={handleDeleteKey}
                      onGetPublicKey={() => getPublicKey(currentKey.name)}
                    />
                  </div>
                ) : (
                  <EmptyState
                    icon={Key}
                    title="No Key Selected"
                    description="Select a key from the list to view its details, or generate a new SSH key pair."
                    action={{
                      label: 'Generate Key',
                      onClick: () => setKeyGeneratorOpen(true),
                    }}
                  />
                )
              ) : (
                <div className="animate-fade-in w-full max-w-4xl mx-auto">
                  <SecurityPanel keys={keys} />
                </div>
              )}
            </div>
          </ScrollArea>
        </main>
      </div>

      {/* Host Form Dialog */}
      <HostForm
        open={hostFormOpen}
        onOpenChange={setHostFormOpen}
        host={hostFormMode === 'edit' ? currentHost : undefined}
        onSubmit={handleHostSubmit}
        mode={hostFormMode}
        existingHosts={hosts.map((h) => h.Host)}
        availableKeys={keys.map((k) => ({
          name: k.name,
          path: `~/.ssh/${k.name}`,
          type: k.type,
        }))}
        allHosts={hosts}
      />

      {/* Key Generator Dialog */}
      <KeyGenerator
        open={keyGeneratorOpen}
        onOpenChange={setKeyGeneratorOpen}
        onGenerate={handleGenerateKey}
        existingKeys={keys.map((k) => k.name)}
      />

      {/* Host Templates Dialog */}
      <HostTemplates
        open={hostTemplatesOpen}
        onOpenChange={setHostTemplatesOpen}
        onSelectTemplate={handleTemplateSelect}
        existingHosts={hosts.map((h) => h.Host)}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">Confirm Delete</DialogTitle>
            <DialogDescription className="pt-2">
              {deleteTarget?.type === 'host' ? (
                <>
                  Are you sure you want to delete{' '}
                  <span className="font-mono text-foreground">
                    {deleteTarget.name}
                  </span>
                  ? This will remove the host from your SSH config.
                </>
              ) : (
                <>
                  Are you sure you want to delete{' '}
                  <span className="font-mono text-foreground">
                    {deleteTarget?.name}
                  </span>
                  ?
                  <span className="block mt-2 text-destructive font-medium">
                    Warning: This will permanently delete both private and
                    public key files!
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Dialog */}
      <UpdateDialog
        open={updateDialogOpen}
        onOpenChange={(open) => {
          setUpdateDialogOpen(open)
          if (
            !open &&
            (updateState === 'up_to_date' || updateState === 'error')
          ) {
            resetUpdateState()
          }
        }}
        state={updateState}
        progress={updateProgress}
        updateInfo={updateInfo}
        error={updateError}
        currentVersion={appVersion}
        onCheckForUpdates={checkForUpdates}
        onStartUpdate={startUpdate}
        onRestartApp={restartApp}
        onRetry={() => {
          resetUpdateState()
          checkForUpdates()
        }}
      />

      {/* Onboarding / Help Dialog */}
      <Onboarding
        open={onboardingOpen}
        onOpenChange={setOnboardingOpen}
        onComplete={() => setOnboardingOpen(false)}
      />
    </div>
  )
}

function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <ToastProvider>
        <TipsProvider>
          <AppContent />
        </TipsProvider>
      </ToastProvider>
    </TooltipProvider>
  )
}

export default App

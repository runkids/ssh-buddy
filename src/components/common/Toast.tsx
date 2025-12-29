import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  title: string
  description?: string
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

interface ToastProviderProps {
  children: ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2, 9)
    setToasts((prev) => [...prev, { ...toast, id }])

    // Auto remove after duration (except errors)
    if (toast.type !== 'error') {
      setTimeout(
        () => {
          setToasts((prev) => prev.filter((t) => t.id !== id))
        },
        toast.type === 'success' ? 3000 : 5000
      )
    }
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

interface ToastContainerProps {
  toasts: Toast[]
  onRemove: (id: string) => void
}

function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
}

interface ToastItemProps {
  toast: Toast
  onRemove: (id: string) => void
}

const toastConfig = {
  success: {
    icon: CheckCircle2,
    borderColor: 'border-primary/70',
    iconColor: 'text-primary',
    shadowClass: 'shadow-brutal-sm',
    prefix: '[OK]',
  },
  error: {
    icon: AlertCircle,
    borderColor: 'border-destructive/70',
    iconColor: 'text-destructive',
    shadowClass: 'shadow-brutal-destructive-sm',
    prefix: '[ERR]',
  },
  warning: {
    icon: AlertTriangle,
    borderColor: 'border-warning/70',
    iconColor: 'text-warning',
    shadowClass: 'shadow-brutal-warning',
    prefix: '[WARN]',
  },
  info: {
    icon: Info,
    borderColor: 'border-primary/50',
    iconColor: 'text-primary/80',
    shadowClass: 'shadow-brutal-dark-sm',
    prefix: '[INFO]',
  },
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  const config = toastConfig[toast.type]
  const Icon = config.icon

  return (
    <div
      className={cn(
        'flex items-start gap-3 border-brutal bg-card p-4',
        'animate-slide-in-right',
        config.borderColor,
        config.shadowClass
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', config.iconColor)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          <span className={cn('mr-2 text-xs', config.iconColor)}>
            {config.prefix}
          </span>
          {toast.title}
        </p>
        {toast.description && (
          <p className="text-sm text-muted-foreground mt-1 pl-12">
            {toast.description}
          </p>
        )}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors border-2 border-transparent hover:border-primary/30"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// Convenience hooks for common toast types
export function useSuccessToast() {
  const { addToast } = useToast()
  return useCallback(
    (title: string, description?: string) => {
      addToast({ type: 'success', title, description })
    },
    [addToast]
  )
}

export function useErrorToast() {
  const { addToast } = useToast()
  return useCallback(
    (title: string, description?: string) => {
      addToast({ type: 'error', title, description })
    },
    [addToast]
  )
}

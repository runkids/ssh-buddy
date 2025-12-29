import { useState, useEffect, useCallback } from 'react'
import { Loader2, AlertCircle, Shield, Info, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

type KeyType = 'ed25519' | 'rsa'

interface KeyGeneratorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerate: (options: GenerateKeyOptions) => Promise<void>
  existingKeys?: string[]
}

export interface GenerateKeyOptions {
  name: string
  type: KeyType
  comment: string
  passphrase: string
}

interface FormErrors {
  name?: string
  comment?: string
  passphrase?: string
  confirmPassphrase?: string
}

export function KeyGenerator({
  open,
  onOpenChange,
  onGenerate,
  existingKeys = [],
}: KeyGeneratorProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<KeyType>('ed25519')
  const [comment, setComment] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  const [showPassphrase, setShowPassphrase] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const resetForm = useCallback(() => {
    setName('')
    setType('ed25519')
    setComment('')
    setPassphrase('')
    setConfirmPassphrase('')
    setShowPassphrase(false)
    setErrors({})
    setTouched({})
  }, [])

  useEffect(() => {
    if (open) {
      resetForm()
    }
  }, [open, resetForm])

  // Validation functions
  const validateName = useCallback(
    (value: string): string | undefined => {
      if (!value.trim()) {
        return 'Key name is required'
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
        return 'Name can only contain letters, numbers, underscores, and hyphens'
      }
      if (existingKeys.includes(value.trim())) {
        return 'This key name already exists'
      }
      return undefined
    },
    [existingKeys]
  )

  const validatePassphrase = (value: string): string | undefined => {
    if (!value) return undefined
    if (value.length < 8) {
      return 'Passphrase must be at least 8 characters'
    }
    return undefined
  }

  const validateConfirmPassphrase = useCallback(
    (value: string): string | undefined => {
      if (!passphrase) return undefined
      if (value !== passphrase) {
        return 'Passphrases do not match'
      }
      return undefined
    },
    [passphrase]
  )

  // Validate all fields
  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {
      name: validateName(name),
      passphrase: validatePassphrase(passphrase),
      confirmPassphrase: validateConfirmPassphrase(confirmPassphrase),
    }

    setErrors(newErrors)
    return !Object.values(newErrors).some((error) => error !== undefined)
  }, [
    name,
    passphrase,
    confirmPassphrase,
    validateName,
    validateConfirmPassphrase,
  ])

  // Handle field blur
  const handleBlur = (field: keyof FormErrors) => {
    setTouched((prev) => ({ ...prev, [field]: true }))

    let error: string | undefined
    switch (field) {
      case 'name':
        error = validateName(name)
        break
      case 'passphrase':
        error = validatePassphrase(passphrase)
        break
      case 'confirmPassphrase':
        error = validateConfirmPassphrase(confirmPassphrase)
        break
    }

    setErrors((prev) => ({ ...prev, [field]: error }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setTouched({
      name: true,
      passphrase: true,
      confirmPassphrase: true,
    })

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      await onGenerate({
        name: name.trim(),
        type,
        comment: comment.trim(),
        passphrase,
      })
      onOpenChange(false)
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        name: err instanceof Error ? err.message : 'Failed to generate key',
      }))
    } finally {
      setLoading(false)
    }
  }

  const handleNameChange = (value: string) => {
    setName(value)
    if (errors.name) {
      setErrors((prev) => ({ ...prev, name: undefined }))
    }
  }

  const handlePassphraseChange = (value: string) => {
    setPassphrase(value)
    if (errors.passphrase) {
      setErrors((prev) => ({ ...prev, passphrase: undefined }))
    }
    // Re-validate confirm if it has value
    if (confirmPassphrase && value !== confirmPassphrase) {
      setErrors((prev) => ({
        ...prev,
        confirmPassphrase: 'Passphrases do not match',
      }))
    } else if (confirmPassphrase) {
      setErrors((prev) => ({ ...prev, confirmPassphrase: undefined }))
    }
  }

  const handleConfirmPassphraseChange = (value: string) => {
    setConfirmPassphrase(value)
    if (errors.confirmPassphrase) {
      setErrors((prev) => ({ ...prev, confirmPassphrase: undefined }))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center bg-primary/10 border-2 border-primary/30">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg">Generate SSH Key</DialogTitle>
              <DialogDescription>
                Create a new SSH key pair for secure authentication
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <DialogBody className="space-y-5 py-4">
            {/* Key Name */}
            <div className="space-y-2">
              <Label htmlFor="keyName" className="flex items-center gap-1">
                Key Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="keyName"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                onBlur={() => handleBlur('name')}
                placeholder="e.g., github, work, personal"
                disabled={loading}
                className={cn(
                  touched.name &&
                    errors.name &&
                    'border-destructive focus-visible:ring-destructive'
                )}
              />
              {touched.name && errors.name ? (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.name}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Will be saved as ~/.ssh/{name || 'keyname'}
                </p>
              )}
            </div>

            {/* Key Type */}
            <div className="space-y-2">
              <Label htmlFor="keyType">Key Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as KeyType)}
                disabled={loading}
              >
                <SelectTrigger id="keyType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ed25519">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Ed25519</span>
                      <span className="text-xs text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
                        Recommended
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="rsa">RSA (4096 bits)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {type === 'ed25519'
                  ? 'Ed25519 is modern, fast, and secure. Recommended for most use cases.'
                  : 'RSA 4096 has better compatibility with older systems.'}
              </p>
            </div>

            {/* Comment */}
            <div className="space-y-2">
              <Label htmlFor="comment">
                Comment{' '}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="e.g., your@email.com"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Used to identify the key, typically an email address
              </p>
            </div>

            {/* Passphrase */}
            <div className="space-y-2">
              <Label htmlFor="passphrase">
                Passphrase{' '}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <div className="relative">
                <Input
                  id="passphrase"
                  type={showPassphrase ? 'text' : 'password'}
                  value={passphrase}
                  onChange={(e) => handlePassphraseChange(e.target.value)}
                  onBlur={() => handleBlur('passphrase')}
                  placeholder="Add password protection to your key"
                  disabled={loading}
                  className={cn(
                    'pr-10',
                    touched.passphrase &&
                      errors.passphrase &&
                      'border-destructive focus-visible:ring-destructive'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassphrase(!showPassphrase)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassphrase ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {touched.passphrase && errors.passphrase && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.passphrase}
                </p>
              )}
            </div>

            {/* Confirm Passphrase */}
            {passphrase && (
              <div className="space-y-2 animate-fade-in">
                <Label htmlFor="confirmPassphrase">Confirm Passphrase</Label>
                <Input
                  id="confirmPassphrase"
                  type={showPassphrase ? 'text' : 'password'}
                  value={confirmPassphrase}
                  onChange={(e) =>
                    handleConfirmPassphraseChange(e.target.value)
                  }
                  onBlur={() => handleBlur('confirmPassphrase')}
                  placeholder="Re-enter passphrase"
                  disabled={loading}
                  className={cn(
                    touched.confirmPassphrase &&
                      errors.confirmPassphrase &&
                      'border-destructive focus-visible:ring-destructive'
                  )}
                />
                {touched.confirmPassphrase && errors.confirmPassphrase && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.confirmPassphrase}
                  </p>
                )}
              </div>
            )}

            {/* Info box */}
            <div className="flex items-start gap-3 bg-muted/50 p-3 border-2 border-primary/15">
              <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  Keys will be saved to ~/.ssh/ directory. Fields marked with *
                  are required.
                </p>
                <p>
                  A passphrase adds extra security but must be entered each time
                  the key is used.
                </p>
              </div>
            </div>
          </DialogBody>

          <DialogFooter className="gap-2 sm:gap-0 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? 'Generating...' : 'Generate Key'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

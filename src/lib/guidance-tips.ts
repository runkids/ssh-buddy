import type { TipType } from '@/components/common/ContextualTip'

export interface TipDefinition {
  id: string
  type: TipType
  title: string
  description: string
  suggestions?: string[]
  details?: string
}

// Multi-account platform tips
export const MULTI_ACCOUNT_PLATFORM_TIP: TipDefinition = {
  id: 'multi-account-platform',
  type: 'info',
  title: 'Multi-Account Platform',
  description:
    'This platform supports multiple accounts. If you have multiple accounts (e.g., personal and work), each account needs a different SSH key.',
  suggestions: [
    'Create a dedicated SSH key for each account',
    'Use different Host aliases to distinguish between accounts',
    'Make sure each Host config points to the correct key file',
  ],
  details:
    'SSH servers identify you by your key. If two Host configs use the same key, the server cannot distinguish which account you want to use. Therefore, each account needs its own key pair.',
}

export const SAME_KEY_WARNING: TipDefinition = {
  id: 'same-key-warning',
  type: 'warning',
  title: 'Same Key Warning',
  description: 'This key is already used by another config for the same platform.',
  suggestions: [
    'If this is the same account, you can continue using it',
    'If it\'s a different account, consider creating a new key for it',
  ],
  details:
    'When multiple Host configs use the same key to connect to the same platform, they are treated as the same account. If you want to use different accounts, you need a separate key for each.',
}

// Connection test educational tips
export const HOST_KEY_CHANGED_TIP: TipDefinition = {
  id: 'host-key-changed',
  type: 'warning',
  title: 'Why did this happen?',
  description:
    'The remote host\'s key has changed. This usually occurs when the server is reinstalled or the platform updates its keys.',
  suggestions: [
    'If this is an expected change (e.g., server reset), you can safely remove the old key',
    'If you\'re unsure why, consider verifying with the server administrator',
  ],
  details:
    'SSH records each server\'s public key (stored in ~/.ssh/known_hosts). When a server\'s key doesn\'t match the record, SSH blocks the connection to protect you from man-in-the-middle attacks.',
}

export const HOST_KEY_UNKNOWN_TIP: TipDefinition = {
  id: 'host-key-unknown',
  type: 'info',
  title: 'First-Time Connection',
  description: 'This is your first time connecting to this host. You need to verify and save its key.',
  suggestions: [
    'For well-known platforms (GitHub, GitLab, etc.), it\'s usually safe to add',
    'For private servers, consider verifying the key fingerprint with the administrator',
  ],
  details:
    'SSH uses a "Trust On First Use" (TOFU) model. On first connection, you need to confirm the server\'s identity. Afterwards, SSH will automatically verify the server key to prevent man-in-the-middle attacks.',
}

export const PERMISSION_DENIED_TIP: TipDefinition = {
  id: 'permission-denied',
  type: 'tip',
  title: 'Common Causes of Auth Failure',
  description: 'The server rejected your SSH key authentication.',
  suggestions: [
    'Verify the correct IdentityFile is specified in your Host config',
    'Confirm your public key is added to the remote service (e.g., GitHub SSH Keys settings)',
    'Check that key file permissions are correct (private key should be 600)',
  ],
  details:
    'Authentication failures usually occur because: 1) Wrong key is being used 2) Public key not added to remote service 3) Key file permissions are too open (SSH rejects insecure keys).',
}

// Extended diagnostic tips

export const KEY_PERMISSIONS_TIP: TipDefinition = {
  id: 'key-permissions',
  type: 'warning',
  title: 'SSH Key Permissions',
  description:
    'SSH requires private keys to have restricted permissions for security.',
  suggestions: [
    'Private key (id_ed25519, id_rsa) must have 600 permissions',
    'Public key (*.pub) can have 644 permissions',
    '~/.ssh directory should have 700 permissions',
  ],
  details:
    'SSH refuses to use private keys that are readable by other users. This protects your key from being stolen. Run "chmod 600 ~/.ssh/your_key" to fix the permissions.',
}

export const SSH_AGENT_TIP: TipDefinition = {
  id: 'ssh-agent',
  type: 'info',
  title: 'SSH Agent',
  description:
    'The SSH agent stores your keys in memory so you don\'t have to enter the passphrase every time.',
  suggestions: [
    'Add your key to the agent: ssh-add ~/.ssh/your_key',
    'On macOS, use --apple-use-keychain to store in Keychain',
    'The agent keeps your key until you log out or explicitly remove it',
  ],
  details:
    'When you have a passphrase-protected key, SSH needs the passphrase to decrypt it. The SSH agent stores the decrypted key in memory, so subsequent connections don\'t need the passphrase. This is both convenient and secure.',
}

export const PASSPHRASE_TIP: TipDefinition = {
  id: 'passphrase',
  type: 'info',
  title: 'Passphrase-Protected Keys',
  description:
    'Your SSH key is protected with a passphrase, which is good for security.',
  suggestions: [
    'Add the key to SSH agent to avoid entering passphrase repeatedly',
    'On macOS: ssh-add --apple-use-keychain ~/.ssh/your_key',
    'On Linux: ssh-add ~/.ssh/your_key',
  ],
  details:
    'A passphrase-protected key is encrypted at rest. Even if someone copies your private key file, they cannot use it without the passphrase. The SSH agent lets you enter the passphrase once per session.',
}

export const WRONG_KEY_TIP: TipDefinition = {
  id: 'wrong-key',
  type: 'tip',
  title: 'Multiple SSH Keys',
  description:
    'SSH tried multiple keys but none were accepted. This usually means the correct key is not being used.',
  suggestions: [
    'Set IdentityFile in your Host config to specify the correct key',
    'Use IdentitiesOnly yes to prevent SSH from trying other keys',
    'Verify your public key is added to the remote service',
  ],
  details:
    'By default, SSH tries all keys in your agent and ~/.ssh directory. When you have multiple keys, SSH might try the wrong one first. Using IdentityFile and IdentitiesOnly ensures the right key is used.',
}

export const AUTH_METHOD_TIP: TipDefinition = {
  id: 'auth-method',
  type: 'warning',
  title: 'Authentication Method Not Supported',
  description:
    'The server does not accept your authentication method or key type.',
  suggestions: [
    'Check if the server allows public key authentication',
    'Try using a different key type (Ed25519 is recommended)',
    'Contact the server administrator if the issue persists',
  ],
  details:
    'Some servers have strict requirements for key types or authentication methods. Older servers might not support Ed25519 keys, while newer ones might reject older RSA keys with small bit sizes.',
}

export const IDENTITY_FILE_TIP: TipDefinition = {
  id: 'identity-file',
  type: 'warning',
  title: 'Identity File Not Found',
  description: 'The configured SSH key file does not exist.',
  suggestions: [
    'Check the IdentityFile path in your SSH config',
    'The key may have been moved or deleted',
    'Generate a new key if needed',
  ],
  details:
    'SSH config points to a key file that doesn\'t exist. This could happen if you moved or renamed the key, or if the path is incorrect. Use the full path or ~ shorthand for home directory.',
}

// Platform detection patterns
export const MULTI_ACCOUNT_PLATFORMS = [
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'ssh.dev.azure.com',
]

export function isMultiAccountPlatform(hostname: string): boolean {
  const normalizedHost = hostname.toLowerCase()
  return MULTI_ACCOUNT_PLATFORMS.some(
    (platform) =>
      normalizedHost.includes(platform) || normalizedHost === platform
  )
}

export function getPlatformName(hostname: string): string | null {
  const normalizedHost = hostname.toLowerCase()
  if (normalizedHost.includes('github.com')) return 'GitHub'
  if (normalizedHost.includes('gitlab.com')) return 'GitLab'
  if (normalizedHost.includes('bitbucket.org')) return 'Bitbucket'
  if (normalizedHost.includes('ssh.dev.azure.com')) return 'Azure DevOps'
  return null
}

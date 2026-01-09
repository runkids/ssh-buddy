<p align="center">
  <img src="public/logo-rounded.png" alt="SSH Buddy" width="128" height="128" style="border-radius: 20px;">
</p>

<h1 align="center">SSH Buddy</h1>

<p align="center">
  <em>Your friendly SSH companion</em> 🐢
</p>

<p align="center">
  A lightweight, local-first SSH configuration manager with <strong>smart diagnostics</strong>.
</p>

<p align="center">
  <a href="https://github.com/runkids/ssh-buddy/releases">Download latest release</a>
</p>

<p align="center">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-supported-1f2937">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-supported-1f2937">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-1f2937">
  <img alt="Release" src="https://img.shields.io/github/v/release/runkids/ssh-buddy">
</p>

---

## "I know `~/.ssh/config`. Why do I need this?"

You don't *need* it. If you're comfortable editing config files and debugging SSH errors, you're all set.

**But even power users waste time on:**

| Scenario | Without SSH Buddy | With SSH Buddy |
|----------|-------------------|----------------|
| `Permission denied (publickey)` | Check key path → check permissions → check agent → check known_hosts → ... | Click "Diagnose" → see exactly what's wrong → one-click fix |
| "Is my RSA key still secure?" | `ssh-keygen -l -f ~/.ssh/id_rsa` + Google recommended bit length | Security tab shows warnings for weak keys automatically |
| New laptop, set up GitHub + GitLab + work accounts | Write 3 Host blocks, generate keys, copy pubkeys, test each... | Git Wizard: 2 min per account, guided step-by-step |
| "Which key am I using for what?" | `cat ~/.ssh/config`, try to remember | Visual list with tags, favorites, and search |
| Host key changed warning | Manually edit `~/.ssh/known_hosts` line 47 | Click "Remove old key" → done |

**SSH Buddy reads and writes to your actual `~/.ssh/config`.** No proprietary format, no lock-in. Stop using it anytime and your config still works.

---

## ✨ Key Features

### 🔗 Git Platform Wizard
Connect to GitHub, GitLab, or Bitbucket without memorizing SSH syntax.

- Choose platform → Select/generate key → Copy to platform → Done
- Supports multiple accounts (personal + work)
- Auto-generates proper `~/.ssh/config` entries

### 🩺 Smart Diagnostics
When SSH connections fail, stop guessing.

- **Preflight checks**: Key exists? Permissions correct? SSH Agent running?
- **Connection testing**: Real SSH handshake with detailed error analysis
- **One-click fixes**: Fix permissions, add to SSH Agent, update known_hosts

### 🛡️ Proactive Security
Your config gets a health check.

- Weak key detection (DSA deprecated, RSA < 3072 bits)
- Permission audits (keys should be 600, not 644)
- Known hosts review (detect changed host keys)
- Algorithm warnings

### 🖥️ Visual Host Management
All your SSH hosts in one place.

- Add, edit, delete hosts with a clean UI
- Smart templates for common setups (jump hosts, port forwarding)
- Tags and favorites for organization
- Change preview before saving

### 🔑 Key Management
Overview all your SSH keys.

- Generate Ed25519 or RSA keys
- One-click copy public key
- Key details (type, bits, fingerprint)

### 🔄 In-App Updates
Stay up to date without leaving the app.

- Check for new versions directly in settings
- Download and install updates with one click
- Release notes preview before updating

---

## 🔒 Privacy First

- **100% local**: No accounts, no cloud sync, no telemetry
- **Your keys stay on your device**: We read `~/.ssh/`, we don't upload anything
- **Open source**: Audit the code yourself

---

## 📸 Screenshots

### Visual Host Management
Manage all your SSH hosts with a clean, intuitive interface.

<p align="center">
  <img src="public/screenshots/hosts.png" alt="Hosts view" width="780">
</p>

### Proactive Security Scanning
Get warnings about weak keys, permission issues, and security risks.

<p align="center">
  <img src="public/screenshots/security.png" alt="Security view" width="780">
</p>

### Git Platform Wizard
Connect to GitHub, GitLab, or Bitbucket in minutes with step-by-step guidance.

<p align="center">
  <img src="public/screenshots/wizard.png" alt="Wizard view" width="780">
</p>

---

## 📦 Installation

### macOS

```bash
# Install via Homebrew
brew tap runkids/tap && brew install --cask ssh-buddy
```

Or download the latest `.dmg` from [Releases](https://github.com/runkids/ssh-buddy/releases) and drag to Applications.

<details>
<summary>Homebrew: Troubleshooting SHA256 mismatch errors</summary>

If you encounter a SHA256 mismatch error during installation:

```bash
# Clear Homebrew's download cache and retry
brew cleanup ssh-buddy
brew install --cask ssh-buddy

# Or force reinstall
brew reinstall --cask ssh-buddy
```

This usually happens when Homebrew has a cached download from a previous version.

</details>

### Windows

Download the latest `.msi` from [Releases](https://github.com/runkids/ssh-buddy/releases) and run the installer.

<details>
<summary>Windows: Enable SSH Agent (required for full functionality)</summary>

```powershell
# Run PowerShell as Administrator
Get-Service ssh-agent | Set-Service -StartupType Automatic -PassThru | Start-Service
```

Or: Services (services.msc) → OpenSSH Authentication Agent → Startup type: Automatic → Start

</details>

---

## 🛠️ Development

Built with [Tauri](https://tauri.app/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Tailwind CSS](https://tailwindcss.com/)

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/)

### Setup

```bash
pnpm install
pnpm dev:tauri      # Development
pnpm tauri build    # Production build
```

---

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=runkids/ssh-buddy&type=Date)](https://star-history.com/#runkids/ssh-buddy&Date)

---

## 📄 License

MIT

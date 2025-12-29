<p align="center">
  <img src="public/logo-rounded.png" alt="SSH Buddy" width="128" height="128" style="border-radius: 20px;">
</p>

<h1 align="center">SSH Buddy</h1>

<p align="center">
  <em>Your friendly SSH companion</em> 🐢
</p>

<p align="center">
  A lightweight, local SSH configuration manager for macOS and Windows.
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

## 💡 Why SSH Buddy

SSH Buddy keeps SSH management fast and local. No accounts, no cloud sync, and no hidden config edits. You get a clean UI, smart templates, and safe previews for every change.

## 📸 Screenshots

<p align="center">
  <img src="public/screenshots/hosts.png" alt="Hosts view" width="780">
</p>

<p align="center">
  <img src="public/screenshots/security.png" alt="Hosts view" width="780">
</p>


## ✨ Features

🖥️ **Host Management** - Visual editor, smart templates, tagging, favorites & validation

🔑 **Key Management** - Overview all keys, generate Ed25519/RSA, one-click copy

🛡️ **Security** - Health checks, known hosts review, algorithm warnings

🎨 **User Experience** - Onboarding guide, inline help, change preview, dark theme, auto updates

## 📦 Installation

### macOS

```bash
# Install via Homebrew
brew tap runkids/tap && brew install --cask ssh-buddy
```

Or download the latest `.dmg` from Releases and drag to Applications.

### Windows

Download the latest `.msi` from Releases and run the installer.

## 🛠️ Development

SSH Buddy is built with:
- [Tauri](https://tauri.app/) - Lightweight native app framework
- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) - UI framework
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Vite](https://vite.dev/) - Build tool

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/) (for Tauri)

### Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev:tauri

# Build for production
pnpm tauri build
```

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=runkids/ssh-buddy&type=Date)](https://star-history.com/#runkids/ssh-buddy&Date)

## 📄 License

MIT

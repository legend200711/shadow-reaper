# Shadow Desktop Companion — USB Installation Package

This directory contains installation packages for the Shadow Desktop Companion.

## Installation

1. Plug the USB drive into your computer
2. Open the appropriate installer for your operating system
3. Follow the on-screen installation instructions
4. Launch Shadow Desktop Companion
5. Use the pairing screen to pair with your Shadow Edition phone
6. Remove the USB drive — Shadow continues operating from your computer

## Packages

| Platform | File                                    |
|----------|-----------------------------------------|
| Windows  | Windows/ShadowDesktopCompanion-Setup.exe |
| macOS    | macOS/ShadowDesktopCompanion.dmg         |
| Linux    | Linux/shadow-desktop-companion.deb       |
|          | Linux/shadow-desktop-companion.rpm       |
|          | Linux/ShadowDesktopCompanion.AppImage    |

## Build Status

- Windows: IMPLEMENTED — PHYSICAL BUILD PENDING (requires electron-builder on Windows)
- macOS:   IMPLEMENTED — PHYSICAL BUILD PENDING (requires electron-builder on macOS)
- Linux:   IMPLEMENTED — PHYSICAL BUILD PENDING (requires electron-builder on Linux)

## Building

From the `desktop/` directory:

```bash
# Install dependencies
npm install

# Build for current platform
npm run start        # run in development
npm run build:win    # build Windows installer
npm run build:mac    # build macOS DMG
npm run build:linux  # build Linux packages
npm run build:all    # build all platforms
```

## Portable Mode

Shadow Desktop Companion supports a portable mode for future use.

Limitations in portable mode:
- Background services require normal installation
- Startup integration (start with computer) requires normal installation
- OS-level permissions (microphone, accessibility) require normal installation
- Secure credential storage (Keychain / Credential Manager) requires normal installation
- Portable mode credentials fall back to session-only memory

## Requirements

- Node.js 18+
- Electron 31+
- Windows 10+, macOS 11+, or modern Linux (Ubuntu 20.04+, Fedora 35+)

## Security

- No silent autorun installation
- No autorun.inf or autostart scripts on USB
- Installation requires explicit user action
- After installation, USB can be safely removed

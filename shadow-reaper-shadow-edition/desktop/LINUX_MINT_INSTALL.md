# Shadow Desktop Companion — Linux Mint Installation Guide

Build: SR-DESKTOP-1 — Linux Mint Physical Deployment Pass

---

## Prerequisites

**Required system packages** (install before building/running):

```bash
sudo apt update
sudo apt install libsecret-1-0 libsecret-1-dev libgnome-keyring-dev \
                 libnotify4 libappindicator3-1 \
                 pulseaudio-utils \
                 gnome-keyring
```

**Notes:**
- `libsecret-1-0` — required at runtime for secure credential storage (keytar)
- `libsecret-1-dev` + `libgnome-keyring-dev` — required to compile keytar native bindings at `npm install`
- `gnome-keyring` — Secret Service daemon (usually pre-installed on Linux Mint Cinnamon)
- `pulseaudio-utils` — provides `pactl` for volume/mute control
- `libappindicator3-1` — system tray support

**Optional (media control):**

```bash
sudo apt install playerctl
```

Enables: play, pause, next, previous track commands.
Without playerctl, media controls return `NOT_SUPPORTED` (Shadow reports this clearly).

---

## Install from .deb (Primary method)

```bash
sudo dpkg -i ShadowDesktopCompanion-linux-x64.deb
```

If dpkg reports missing dependencies:

```bash
sudo apt -f install
```

Launch from application menu:
**Search "Shadow" → Shadow Desktop Companion**

Or from terminal:

```bash
shadow-desktop-companion
```

---

## Install from AppImage (Alternative — no root required)

```bash
chmod +x ShadowDesktopCompanion-linux-x64.AppImage
./ShadowDesktopCompanion-linux-x64.AppImage
```

AppImage limitations:
- System tray requires `libappindicator3-1` or equivalent
- Startup integration (Start With Computer) still works via XDG autostart
- Credential storage works if `gnome-keyring` is running

---

## First Launch

1. Shadow Desktop Companion opens with a chat interface
2. Navigate to **DEVICES** tab
3. Enter a computer name (e.g. "Chris Linux PC")
4. Click **Generate Pairing Code**
5. A 6-digit code is displayed — expires in 10 minutes
6. Click **Show QR Code** to display QR (requires `npm install` + pairing to have been started)
7. Use Shadow Edition on your phone to scan the code
8. Once paired, Shadow can control this computer remotely

---

## Credential Storage

Shadow stores pairing credentials using the OS Secret Service (libsecret / gnome-keyring).

**If keytar is unavailable**, Shadow will:
- Show a warning in the terminal
- Hold credentials in memory for this session ONLY
- Lose pairing state on restart

To fix:
```bash
sudo apt install libsecret-1-dev libgnome-keyring-dev
cd /path/to/shadow-reaper-shadow-edition/desktop
npm install
```

**Shadow NEVER writes credentials to a plaintext file.**

---

## Audio / Volume Control

Linux Mint uses PulseAudio or PipeWire (with PulseAudio compatibility).
Shadow uses `pactl` for volume control.

Test manually:
```bash
pactl set-sink-volume @DEFAULT_SINK@ +10%   # volume up
pactl set-sink-volume @DEFAULT_SINK@ -10%   # volume down
pactl set-sink-mute @DEFAULT_SINK@ 1        # mute
pactl set-sink-mute @DEFAULT_SINK@ 0        # unmute
```

If `pactl` is missing: `sudo apt install pulseaudio-utils`

---

## Screen Lock

Shadow uses `xdg-screensaver lock` (XDG standard — works on Cinnamon, GNOME, XFCE, KDE).
Falls back to `loginctl lock-session` if xdg-screensaver is unavailable.

---

## Start With Computer

In Shadow Settings → **Start With Computer** toggle.

Creates: `~/.config/autostart/shadow-desktop-companion.desktop`

Removing: toggle off in Settings, or:
```bash
rm ~/.config/autostart/shadow-desktop-companion.desktop
```

---

## Tray Icon

Linux Mint Cinnamon supports system tray.

If the tray icon is not visible:
- Some minimal desktop environments require `libappindicator3-1`
- Install: `sudo apt install libappindicator3-1`

---

## Pairing Status

| Status | Meaning |
|--------|---------|
| LOCAL PAIRING AVAILABLE | This computer can generate a pairing code |
| REMOTE RELAY NOT CONFIGURED | Remote cross-network control requires Stage 9 relay deployment |

**Remote control from phone works only when:**
- Stage 9 relay is deployed
- This computer is paired with a relay URL
- Both phone and computer have network access

---

## Uninstalling

```bash
# Remove application
sudo dpkg -r shadow-desktop-companion

# Remove startup entry (if enabled)
rm -f ~/.config/autostart/shadow-desktop-companion.desktop

# Remove application config (approved apps, settings)
rm -rf ~/.config/shadow-desktop-companion

# Remove keychain credentials (run before removing for clean state)
# Note: shadow stores under service name "ShadowDesktopCompanion" in gnome-keyring
```

**Shadow DOES NOT touch your Shadow Reaper cloud data on uninstall.**
**Shadow DOES NOT leave a background agent running after uninstall.**

---

## Physical Test Status

```
LINUX MINT BUILD READY — USER PHYSICAL INSTALLATION REQUIRED
```

The following require physical installation to verify:
- [ ] .deb installs cleanly on Linux Mint
- [ ] Application appears in launcher as "Shadow Desktop Companion"
- [ ] Shadow opens and displays chat interface
- [ ] Voice input works (browser microphone API)
- [ ] TTS speaks responses
- [ ] Volume control via pactl
- [ ] Screen lock via xdg-screensaver
- [ ] Startup toggle creates/removes XDG autostart entry
- [ ] Tray icon visible in Cinnamon tray
- [ ] Tray → Quit Shadow terminates app cleanly
- [ ] Pairing code generated + QR displayed
- [ ] keytar loads and persists credentials across restarts

---

## Build From Source

```bash
cd shadow-reaper-shadow-edition/desktop
npm install
npm run build:linux
```

Output artifacts:
- `dist/ShadowDesktopCompanion-linux-x64.deb`
- `dist/ShadowDesktopCompanion-linux-x64.AppImage`
- `dist/ShadowDesktopCompanion-linux-x64.rpm`
